import { join } from 'path';
import { EOL } from 'os';
import { lstatSync, readdirSync, copyFileSync } from 'fs';
import {
    ExecutorContext,
    ProjectGraphProjectNode,
    readJsonFile,
    writeJsonFile,
    logger,
    ProjectGraph,
    createProjectGraphAsync,
    getOutputsForTargetAndConfiguration
} from '@nx/devkit';
import {
    createDirectory,
    directoryExists
} from '@nx/workspace/src/utilities/fileutils';
import { calculateProjectDependencies } from '@nx/js/src/utils/buildable-libs-utils';
import validate from 'validate-npm-package-name';

type BundableDependency = {
    projectName: string;
    packageName: string;
    validPackageName: boolean;
    isScoped: boolean;
    distPath: string;
};

export default async function runExecutor(
    options: unknown = {},
    context: ExecutorContext
): Promise<{ success: boolean }> {
    const projectGraph = await createProjectGraphAsync();
    const { target, nonBuildableDependencies } = calculateProjectDependencies(
        projectGraph,
        context.root,
        context.projectName,
        context.targetName,
        context.configurationName
    );

    const bundableDependencies = nonBuildableDependencies.map(
        (dependencyName: string) =>
            toBundableDependency(context, projectGraph, dependencyName)
    );

    const success = updateBundledDependencies(
        context.root,
        context.projectName,
        context.configurationName,
        target,
        bundableDependencies
    );

    return Promise.resolve({ success });
}

export function updateBundledDependencies(
    root: string,
    projectName: string,
    configurationName: string,
    node: ProjectGraphProjectNode,
    dependencies: BundableDependency[]
): boolean {
    let success = true;
    const task = {
        id: 'build',
        outputs: [],
        overrides: {},
        target: {
            project: projectName,
            target: 'build',
            configuration: configurationName
        }
    };

    const outputs = getOutputsForTargetAndConfiguration(task, node);

    const packageJsonPath = join(outputs[0], 'package.json');
    const nodeModulesPath = join(outputs[0], 'node_modules');
    let packageJson;
    try {
        packageJson = readJsonFile(packageJsonPath);
    } catch (e) {
        logger.error(`${EOL} Error reading package.json from ${projectName}`);
        return false;
    }

    packageJson.bundledDependencies = packageJson.bundledDependencies || [];

    let updatePackageJson = false;
    dependencies
        // filter out failed to load packages
        .filter((dependency: BundableDependency) => !!dependency.packageName)
        .forEach((dependency: BundableDependency) => {
            if (dependency.validPackageName) {
                if (!hasDependency(packageJson, dependency.packageName)) {
                    packageJson['bundledDependencies'].push(
                        dependency.packageName
                    );
                    updatePackageJson = true;
                    logger.info(`${EOL} Processing ${dependency.projectName}`);
                    copyFolderSync(
                        dependency.distPath,
                        join(nodeModulesPath, dependency.packageName)
                    );
                } else if (
                    !directoryExists(
                        join(nodeModulesPath, dependency.packageName)
                    )
                ) {
                    logger.warn(`${EOL} Processing ${dependency.projectName}`);
                    logger.warn(
                        `${EOL} The package name ${dependency.packageName} was already declared in your bundledDependencies but was not found in the node_modules`
                    );
                }
            } else {
                logger.error(`${EOL} Processing ${dependency.projectName}`);
                logger.error(
                    `${EOL} The package name ${dependency.packageName} associated with ${dependency.projectName} is not valid. Make sure to use the --import-path modifier when creating buildable libraries`
                );
                success = false;
            }
        });

    if (updatePackageJson) {
        writeJsonFile(packageJsonPath, packageJson);
    }
    return success;
}

function toBundableDependency(
    context: ExecutorContext,
    projectGraph: ProjectGraph,
    dependencyName: string
): BundableDependency {
    const task = {
        id: 'build',
        outputs: [],
        overrides: {},
        target: {
            project: context.projectName,
            target: 'build',
            configuration: context.configurationName
        }
    };
    const outputs = getOutputsForTargetAndConfiguration(
        task,
        projectGraph.nodes[dependencyName]
    );

    const packageJsonPath = join(outputs[0], 'package.json');
    let packageJson;
    try {
        packageJson = readJsonFile(packageJsonPath);
        return {
            projectName: dependencyName,
            packageName: packageJson.name,
            validPackageName: validate(packageJson.name).validForNewPackages,
            isScoped: isScoped(packageJson.name),
            distPath: join(outputs[0])
        };
    } catch (e) {
        logger.error(
            `${EOL} Error reading package.json from ${dependencyName}`
        );
        return {
            projectName: dependencyName,
            packageName: null,
            validPackageName: false,
            isScoped: false,
            distPath: join(outputs[0])
        };
    }
}

// verify whether the package.json already specifies the bundledDep
function hasDependency(outputJson, dep: string) {
    return outputJson['bundledDependencies'].includes(dep);
}

// checks whether the package name is scoped (e.g @foo/bar)
function isScoped(name: string) {
    const regex = '@[a-z\\d][\\w-.]+/[a-z\\d][\\w-.]*';
    return new RegExp(`^${regex}$`, 'i').test(name);
}

function copyFolderSync(from: string, to: string) {
    if (!directoryExists(to)) {
        createDirectory(to);
    }
    readdirSync(from).forEach((element: string) => {
        if (lstatSync(join(from, element)).isFile()) {
            try {
                copyFileSync(join(from, element), join(to, element));
            } catch (e) {
                logger.error(
                    `${EOL} Could not copy ${join(from, element)} to ${join(
                        to,
                        element
                    )}`
                );
                throw new Error();
            }
        } else {
            copyFolderSync(join(from, element), join(to, element));
        }
    });
}
