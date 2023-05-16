# nx-bundlefy

Nx executor to ensure that all the buildable dependencies of a publishable library are part of the final bundle.

## Installation

```bash
npm install -D @altack/nx-bundlefy
```

Also make sure to install the required peer dependencies:

```bash
npm install -D @nrwl/js @nrwl/devkit @nrwl/workspace validate-npm-package-name
```

## Configuration

To use the executor, make sure to adjust your publishable library's `project.json`:

```json
{
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/publishable-library/src",
  "targets": {
    "bundlefy": {
      "executor": "@altack/nx-bundlefy:run",
      "configurations": {},
      "dependsOn": ["build"],
      "outputs": ["{options.outputFile}"]
    },
    "build": {
      ...
    }
  }
}
```

Also make sure that buildable & publishable libraries are created using the `--import-path` modifier.

```bash
nx g lib my-library --buildable --import-path @org/my-library
```

## Run the executor

This will ensure that all the buildable libraries are bundled as part of the library build

```bash
nx run publishable-library:bundlefy
```

## Further reading
For a more detailed explanation, see this [Stack Overflow question](https://stackoverflow.com/questions/73551220/how-to-publish-nx-library-with-its-dependencies-bundled/) and the open issue in the [Nx's repository](https://github.com/nrwl/nx/issues/4620)