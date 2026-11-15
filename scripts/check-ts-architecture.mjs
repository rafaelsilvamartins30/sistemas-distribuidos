import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectRoots = [
  "web",
  "keycloak-theme",
  "web-bff",
  "user-service",
  "admin-bff",
  "admin-web",
  "campus",
  "payment",
  "access",
  "ai-rag",
  "gateway",
  "engagement",
].map((name) => ({
  name,
  path: path.join(repositoryRoot, name),
}));
const sourceProjects = [
  { name: "web", paths: ["web/src", "web/vite.config.ts"] },
  { name: "keycloak-theme", paths: ["keycloak-theme/src", "keycloak-theme/vite.config.ts"] },
  { name: "web-bff", paths: ["web-bff/src", "web-bff/test"] },
];
const bffProjects = ["web-bff"];
for (const name of ["admin-bff", "admin-web"]) {
  if (
    await stat(path.join(repositoryRoot, name, "package.json")).catch((error) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    })
  ) {
    sourceProjects.push({ name, paths: [`${name}/src`] });
    if (name === "admin-bff") bffProjects.push(name);
  }
}
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".mjs"]);
const databasePackages = new Set([
  "@mikro-orm/core",
  "@mikro-orm/mongodb",
  "@mikro-orm/mysql",
  "@mikro-orm/postgresql",
  "@mikro-orm/sqlite",
  "@prisma/client",
  "better-sqlite3",
  "drizzle-orm",
  "knex",
  "mariadb",
  "mssql",
  "mongodb",
  "mongoose",
  "mysql",
  "mysql2",
  "pg",
  "pg-native",
  "pg-promise",
  "postgres",
  "prisma",
  "sequelize",
  "sqlite",
  "sqlite3",
  "typeorm",
]);

function isDatabasePackage(moduleName) {
  const packageName = moduleName.startsWith("@")
    ? moduleName.split("/").slice(0, 2).join("/")
    : moduleName.split("/")[0];

  return (
    databasePackages.has(packageName) || packageName.startsWith("@mikro-orm/") || packageName.startsWith("@prisma/")
  );
}

function isWithin(candidate, parent) {
  const relativePath = path.relative(parent, candidate);
  return relativePath === "" || (!relativePath.startsWith(`..${path.sep}`) && relativePath !== "..");
}

async function collectSourceFiles(targetPath) {
  const absolutePath = path.join(repositoryRoot, targetPath);
  const info = await stat(absolutePath);
  if (info.isFile()) {
    return sourceExtensions.has(path.extname(targetPath)) ? [targetPath] : [];
  }

  if (info.isDirectory()) {
    const entries = await readdir(absolutePath, { withFileTypes: true });
    const nestedFiles = await Promise.all(
      entries.map((entry) => {
        const entryPath = path.join(targetPath, entry.name);
        return entry.isDirectory() ? collectSourceFiles(entryPath) : Promise.resolve([entryPath]);
      }),
    );
    return nestedFiles.flat();
  }

  return [];
}

function importedModules(filePath, contents) {
  const source = ts.createSourceFile(
    filePath,
    contents,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx")
      ? ts.ScriptKind.TSX
      : filePath.endsWith(".js") || filePath.endsWith(".mjs")
        ? ts.ScriptKind.JS
        : ts.ScriptKind.TS,
  );
  const modules = [];

  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      modules.push(node.moduleSpecifier.text);
    }

    if (ts.isCallExpression(node) && node.arguments.length > 0 && ts.isStringLiteral(node.arguments[0])) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
      if (isDynamicImport || isRequire) {
        modules.push(node.arguments[0].text);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(source);
  return modules;
}

const violations = [];

for (const project of sourceProjects) {
  const files = (await Promise.all(project.paths.map(collectSourceFiles))).flat();
  for (const relativeFile of files) {
    const absoluteFile = path.join(repositoryRoot, relativeFile);
    const contents = await readFile(absoluteFile, "utf8");
    const modules = importedModules(relativeFile, contents);

    for (const moduleName of modules) {
      if (!moduleName.startsWith(".")) {
        if (bffProjects.includes(project.name) && isDatabasePackage(moduleName)) {
          violations.push(`${relativeFile}: imports database client "${moduleName}"`);
        }
        continue;
      }

      const resolvedPath = path.resolve(path.dirname(absoluteFile), moduleName);
      const otherProject = projectRoots.find(
        (candidate) => candidate.name !== project.name && isWithin(resolvedPath, candidate.path),
      );
      if (otherProject) {
        violations.push(`${relativeFile}: imports implementation from ${otherProject.name} (${moduleName})`);
      }
    }
  }
}

for (const name of bffProjects) {
  const bffPackage = JSON.parse(await readFile(path.join(repositoryRoot, name, "package.json"), "utf8"));
  const bffDependencies = {
    ...bffPackage.dependencies,
    ...bffPackage.devDependencies,
    ...bffPackage.optionalDependencies,
  };
  for (const dependency of Object.keys(bffDependencies)) {
    if (isDatabasePackage(dependency)) {
      violations.push(`${name}/package.json: declares database client "${dependency}"`);
    }
  }
}

if (violations.length > 0) {
  console.error("TypeScript architecture checks failed:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exitCode = 1;
} else {
  console.log("TypeScript architecture checks passed (project imports and BFF database dependencies).");
}
