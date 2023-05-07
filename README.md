# doc2 Command Line Interface (CLI)

The doc2 CLI allows developers to build web experiences with <https://doc2.site>.

## Installation

Install the CLI as a global command. You need Node LTS (18.x) or newer.

```bash
$ npm install -g @doc2/cli
```

## Quick Start

```
      _            ____     ____ _     ___
   __| | ___   ___|___ \   / ___| |   |_ _|
  / _` |/ _ \ / __| __) | | |   | |    | |
 | (_| | (_) | (__ / __/  | |___| |___ | |
  \__,_|\___/ \___|_____|  \____|_____|___|

Usage: doc2 [options] [command]

Options:
  -V, --version   output the version number
  -h, --help      display help for command

Commands:
  live --dev      Run a doc2.live development server
  help [command]  display help for command

```

## Environment

Specify environment variables in the <doc2-project> `.env` file:

```dotenv
DOC2LIVE_SUBDOMAIN=live-demo
```

## Starting doc2.live development

```
$ cd <doc2-project>
$ doc2 live --dev
```
