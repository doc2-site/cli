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
import type { Element } from "hast";

const cwd = process.cwd();

dotenv.config({ path: path.join(cwd, ".env") });

const program = new Command();

console.log(figlet.textSync("doc2 CLI"));

const { version } = JSON.parse(
  fs.readFileSync(path.join(cwd, "package.json")).toString()
);

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
            userResDecorator: function (proxyRes, proxyResData) {
              if (
                String(proxyRes.headers["content-type"]).includes("text/html")
              ) {
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
                      (el) => (el as Element).tagName === "script"
                    );
                    const newHead = select(
                      "head",
                      html2hast(headHtml)
                    ) as Element;

                    head.children = [
                      ...head.children.filter(
                        (el) => (el as Element).tagName !== "script"
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

                  webComponents.forEach((webComponent: Element) => {
                    const { name } = getComponentByTagName(
                      webComponent.tagName
                    );

                    // Read JSON
                    const indexPath = path.join(
                      cwd,
                      "./components",
                      name,
                      `${name}.json`
                    );

                    if (fs.existsSync(indexPath)) {
                      const index = JSON.parse(
                        fs.readFileSync(indexPath).toString()
                      );

                      for (const query of index) {
                        if (query.select) {
                          Object.keys(query.select).forEach((selector) => {
                            const el = select(
                              selector.replace(":host", webComponent.tagName),
                              tree
                            );
                            if (el) {
                              const props = query.select[selector];
                              el.properties = { ...el.properties, ...props };
                            }
                          });
                        }

                        if (query.selectAll) {
                          Object.keys(query.selectAll).forEach((selector) => {
                            selectAll(
                              selector.replace(":host", webComponent.tagName),
                              tree
                            ).forEach((el) => {
                              const props = query.selectAll[selector];
                              el.properties = { ...el.properties, ...props };
                            });
                          });
                        }
                      }
                    }

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
                      const templateElement = html2hast(templateHtml);
                      webComponent.children = [
                        ...templateElement.children,
                        ...webComponent.children,
                      ];
                    }
                  });
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

program.parse();

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
