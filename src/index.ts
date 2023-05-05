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
import { parseFragment } from "parse5";
import fs from "node:fs";
import path from "node:path";
import type { Element } from "hast";

dotenv.config();

//add the following line
const program = new Command();

console.log(figlet.textSync("doc2.site CLI"));

const { version } = JSON.parse(fs.readFileSync("./package.json").toString());

program
  .version(version)
  .description(
    "The doc2.site CLI allows developers to build web experiences with https://doc2.site"
  )
  .parse(process.argv);

program
  .command("dev")
  .description("Run a doc2.site development server")
  .action(() => {
    const start = performance.now();
    try {
      const subdomain = process.env.DOC2SITE_SUBDOMAIN;
      if (!subdomain) {
        throw new Error("Missing DOC2SITE_SUBDOMAIN env variable");
      }

      const html2hast = (html: string) => {
        const p5ast = parseFragment(html, {
          sourceCodeLocationInfo: false,
          scriptingEnabled: false,
        });
        return fromParse5(p5ast) as Element;
      };

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
              let html = new TextDecoder().decode(
                brotli.decompress(proxyResData)
              );
              const tree = html2hast(html);

              const head = fs.readFileSync("./head.html", "utf-8");
              html.replace("</head>", `${head}</head>`);

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
                const { name } = getComponentByTagName(webComponent.tagName);
                // Read JSON
                const indexPath = path.join(
                  "./components",
                  name,
                  `${name}.json`
                );
                if (fs.existsSync(indexPath)) {
                  const index = JSON.parse(
                    fs.readFileSync(indexPath).toString()
                  );

                  if (index.select) {
                    Object.keys(index.select).forEach((selector) => {
                      const el = select(
                        selector.replace(":host", webComponent.tagName),
                        tree
                      );
                      if (el) {
                        const props = index.select[selector];
                        el.properties = { ...el.properties, ...props };
                      }
                    });
                  }

                  if (index.selectAll) {
                    Object.keys(index.selectAll).forEach((selector) => {
                      selectAll(
                        selector.replace(":host", webComponent.tagName),
                        tree
                      ).forEach((el) => {
                        const props = index.selectAll[selector];
                        el.properties = { ...el.properties, ...props };
                      });
                    });
                  }
                }

                // Read template
                const templatePath = path.join(
                  "./components",
                  name,
                  `${name}.html`
                );

                if (fs.existsSync(templatePath)) {
                  const templateHtml = fs.readFileSync(templatePath).toString();
                  const templateElement = html2hast(templateHtml);
                  webComponent.children = [
                    ...templateElement.children,
                    ...webComponent.children,
                  ];
                }
              });

              html = `<!DOCTYPE html>${toHtml(tree)}`;

              return html.replace("</head>", `${head}</head>`);
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
        `doc2.site server started in ${(stop - start).toFixed(2)}ms 🚀`
      );
      consola.info(`http://localhost:${port}`);
    } catch (e) {
      consola.error(e);
    }
  });

program.parse();

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
