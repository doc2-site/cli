#! /usr/bin/env node

import { Command } from "commander";
import { consola } from "consola";
import figlet from "figlet";
import * as dotenv from "dotenv";
import express from "express";
import proxy from "express-http-proxy";
import nocache from "nocache";
import brotli from "brotli";
import { toHtml } from "hast-util-to-html";
import { select, selectAll } from "hast-util-select";
import { fromParse5 } from "hast-util-from-parse5";
import { parse } from "parse5";
import fs from "node:fs";
import path from "node:path";
import fetch from "node-fetch";
import type { Element, Properties } from "hast";

const cwd = process.cwd();

dotenv.config({ path: path.join(cwd, ".env") });

const program = new Command();

console.log(figlet.textSync("doc2 CLI"));

const { version } = JSON.parse(
  fs.readFileSync(path.join(cwd, "package.json")).toString()
);

const timeout = 2000;

program
  .version(version)
  .description(
    "The doc2 CLI allows developers to build web experiences with https://doc2.site"
  );

program
  .command("live")
  .description("The doc2.live CLI")
  .option("--dev", "Run a doc2.live development server")
  .action((options) => {
    if (options.dev) {
      const start = performance.now();
      try {
        const subdomain = process.env.DOC2LIVE_SUBDOMAIN;
        if (!subdomain) {
          throw new Error("Missing DOC2LIVE_SUBDOMAIN env variable");
        }

        const app = express();
        app.use(nocache());
        app.use(express.static("."));
        app.use(
          "/",
          proxy(`https://dev--${subdomain}.doc2.live`, {
            timeout,
            userResDecorator: async function (proxyRes, proxyResData) {
              if (
                String(proxyRes.headers["content-type"]).includes("text/html")
              ) {
                // @ts-ignore
                const url = `${proxyRes.req.protocol}//${proxyRes.req.host}${proxyRes.req.path}`;
                const { pathname } = new URL(url);

                const html2hast = (html: string) => {
                  const p5ast = parse(html, {
                    sourceCodeLocationInfo: false,
                    scriptingEnabled: false,
                  });
                  return fromParse5(p5ast) as Element;
                };

                let html = new TextDecoder().decode(
                  brotli.decompress(proxyResData)
                );

                const tree = html2hast(html);

                // Read head
                const head = select("head", tree);
                if (head) {
                  const headPath = path.join(cwd, "head.html");
                  if (fs.existsSync(headPath)) {
                    const headHtml = fs.readFileSync(headPath).toString();
                    const scripts = head.children.filter(
                      (el) =>
                        (el as Element).tagName === "script" ||
                        (el as Element).tagName === "link"
                    );
                    const newHead = select(
                      "head",
                      html2hast(headHtml)
                    ) as Element;

                    head.children = [
                      ...head.children.filter(
                        (el) =>
                          (el as Element).tagName !== "script" &&
                          (el as Element).tagName !== "link"
                      ),
                      ...newHead.children,
                      ...scripts,
                    ];
                  }
                }

                // Handle components
                const componentHeader = proxyRes.headers["x-components"];
                if (componentHeader) {
                  const components = String(proxyRes.headers["x-components"])
                    .split(",")
                    .map((component) => {
                      const tagName = !component.startsWith("web-")
                        ? `web-${component}`
                        : component;
                      return {
                        tagName,
                        name: component,
                      };
                    });

                  const webComponents = selectAll(
                    components.map(({ tagName }) => tagName).join(","),
                    tree
                  );
                  const getComponentByTagName = (tagName: string) =>
                    components.find(
                      (component) => component.tagName === tagName
                    ) as { tagName: string; name: string };

                  const sheetResolvedReferences = {} as ResolvedReference;

                  for (const webComponent of webComponents) {
                    const { name } = getComponentByTagName(
                      webComponent.tagName
                    );
                    // Read template
                    const templatePath = path.join(
                      cwd,
                      "./components",
                      name,
                      `${name}.html`
                    );
                    if (fs.existsSync(templatePath)) {
                      const templateHtml = fs
                        .readFileSync(templatePath)
                        .toString();

                      const sheetLinks = selectAll(
                        'p:has(a[href^="https://api.doc2.site/v1/spreadsheets/preview/"])',
                        webComponent
                      );
                      const template = html2hast(templateHtml);

                      if (sheetLinks.length) {
                        for (const sheetLink of sheetLinks) {
                          const link = select("a", sheetLink);
                          const href = String(link!.properties!.href);

                          const sheetId = new URL(href).pathname
                            .split("/")
                            .slice(4)
                            .join("/");
                          const sheetTemplate = select(
                            `template[itemtype="urn:spreadsheet:${sheetId}"]`,
                            template
                          );

                          if (!sheetTemplate) {
                            continue;
                          }

                          const searchParams =
                            sheetTemplate!.properties!.dataSearchParams ?? "";
                          const sheetSource = `${href}${searchParams}`;

                          if (!sheetResolvedReferences[sheetSource]) {
                            const reference = await fetch(sheetSource);

                            if (!reference.ok) {
                              continue;
                            }

                            const resolvedReference =
                              (await reference.json()) as Spreadsheet;

                            if (!resolvedReference.rows) {
                              continue;
                            }

                            sheetResolvedReferences[sheetSource] =
                              resolvedReference;
                          }

                          let newChildren = [] as Array<Element>;
                          // @ts-ignore
                          sheetResolvedReferences[sheetSource].rows.forEach(
                            (row: Array<{ [key: string]: string }>) => {
                              const clone = JSON.parse(
                                JSON.stringify(sheetTemplate)
                              );

                              Object.keys(row).forEach((key) => {
                                selectAll(
                                  `[itemprop=${key}]`,
                                  clone.content
                                ).forEach((el) => {
                                  let isProp = false;
                                  for (const name in el.properties) {
                                    if (el.properties[name] === key) {
                                      // @ts-ignore
                                      el.properties[name] = row[key];
                                      isProp = true;
                                    }
                                  }
                                  if (!isProp) {
                                    el.children = [
                                      {
                                        type: "text",
                                        // @ts-ignore
                                        value: row[key],
                                      },
                                    ];
                                  }
                                });
                              });

                              newChildren = [
                                ...newChildren,
                                ...clone.content.children,
                              ];
                            }
                          );

                          sheetLink.tagName = "div";
                          sheetLink.properties = {
                            dataSource: sheetSource,
                          };
                          sheetLink.children = newChildren;

                          webComponent.children = [
                            ...template.children,
                            ...webComponent.children,
                          ];
                        }
                      } else {
                        webComponent.children = [
                          ...template.children,
                          ...webComponent.children,
                        ];
                      }
                    }
                  }
                }

                // Handle ssr.json last before returning the html
                const ssrPath = path.join(cwd, "./ssr.json");

                if (fs.existsSync(ssrPath)) {
                  const ssr = JSON.parse(fs.readFileSync(ssrPath).toString());

                  const applySSR = (el: Element, props: Properties) => {
                    if (props.tagName) {
                      el.tagName = String(props.tagName);
                      props.tagName = undefined;
                    }
                    el.properties = { ...el.properties, ...props };
                  };

                  for (const query of ssr) {
                    if (query.pathname && pathname !== query.pathname) {
                      continue;
                    }

                    if (query.urlRegExp) {
                      const regExp = new RegExp(query.urlRegExp);
                      if (!regExp.test(url)) {
                        continue;
                      }
                    }

                    if (query.select) {
                      Object.keys(query.select).forEach((selector) => {
                        const el = select(selector, tree);
                        if (el) {
                          applySSR(el, query.select[selector]);
                        }
                      });
                    }

                    if (query.selectAll) {
                      Object.keys(query.selectAll).forEach((selector) => {
                        selectAll(selector, tree).forEach((el) => {
                          applySSR(el, query.selectAll[selector]);
                        });
                      });
                    }
                  }
                }

                return `<!DOCTYPE html>${toHtml(tree)}`;
              }

              return proxyResData;
            },
            userResHeaderDecorator(headers) {
              if (String(headers["content-type"]).includes("text/html")) {
                delete headers["content-encoding"];
              }

              if (String(headers["location"]).endsWith("doc2.live/404")) {
                headers["location"] = "http://localhost:3000/404";
              }

              return headers;
            },
          })
        );

        const port = 3000;
        app.listen(port);
        const stop = performance.now();

        consola.success(
          `doc2.live server started in ${(stop - start).toFixed(2)}ms 🚀`
        );
        consola.info(`http://localhost:${port}`);
      } catch (e) {
        consola.error(e);
      }
    } else {
      program.outputHelp();
    }
  });

program
  .command("email")
  .description("The doc2.email CLI")
  .option("--dev", "Run a doc2.email development server")
  .action((options) => {
    if (options.dev) {
      const start = performance.now();
      try {
        const subdomain = process.env.DOC2EMAIL_SUBDOMAIN;
        if (!subdomain) {
          throw new Error("Missing DOC2EMAIL_SUBDOMAIN env variable");
        }

        const app = express();
        const port = 3000;
        const host = `http://localhost:${port}`;

        app.use(nocache());
        app.use(express.static("."));
        app.use(
          "/",
          proxy(`https://dev--${subdomain}.doc2.email`, {
            timeout,
            proxyReqPathResolver: function (req) {
              const { pathname, searchParams } = new URL(`${host}${req.url}`);

              const ssrPath = path.join(cwd, pathname, "ssr.json");
              if (fs.existsSync(ssrPath)) {
                const ssr = JSON.parse(fs.readFileSync(ssrPath).toString());
                searchParams.set("ssr", JSON.stringify(ssr));
              }

              return `${pathname}?${searchParams.toString()}`;
            },
          })
        );

        app.listen(port);
        const stop = performance.now();
        consola.success(
          `doc2.email server started in ${(stop - start).toFixed(2)}ms 🚀`
        );
        consola.info(host);
      } catch (e) {
        consola.error(e);
      }
    } else {
      program.outputHelp();
    }
  });

program.parse();

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
