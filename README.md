# doc2.site Command Line Interface (CLI)

The doc2.site CLI allows developers to build web experiences with <https://doc2.site>.

## Installation

Install the CLI as a global command. You need Node LTS or newer.

```bash
$ npm install -g @doc2site/cli
```

## Quick Start

```
      _            ____        _ _          ____ _     ___
   __| | ___   ___|___ \   ___(_) |_ ___   / ___| |   |_ _|
  / _` |/ _ \ / __| __) | / __| | __/ _ \ | |   | |    | |
 | (_| | (_) | (__ / __/ _\__ \ | ||  __/ | |___| |___ | |
  \__,_|\___/ \___|_____(_)___/_|\__\___|  \____|_____|___|

Usage: doc2site [options] [command]

The doc2.site CLI allows developers to build web experiences with https://doc2.site

Options:
  -V, --version   output the version number
  -h, --help      display help for command

Commands:
  dev             Run a doc2.site development server
  help [command]  display help for command

```

## Environment

Specify environment variables in the <doc2site-project> `.env` file:

```dotenv
DOC2SITE_SUBDOMAIN=live-demo
```

## Starting development

```
$ cd <doc2site-project>
$ doc2site dev
```
