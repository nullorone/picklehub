import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const generatedDirectories = [
    "contracts/openapi",
    "frontend/packages/api/src/generated",
];

const runGeneration = () => {
    const result = spawnSync("npm", ["run", "contracts:generate"], {
        stdio: "inherit",
        shell: process.platform === "win32",
    });
    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
};

const snapshot = () => {
    const files = new Map();
    const visit = (path) => {
        for (const entry of readdirSync(path)) {
            const entryPath = join(path, entry);
            if (statSync(entryPath).isDirectory()) {
                visit(entryPath);
            } else {
                files.set(entryPath, readFileSync(entryPath));
            }
        }
    };
    for (const directory of generatedDirectories) {
        visit(directory);
    }
    return files;
};

runGeneration();
const first = snapshot();
runGeneration();
const second = snapshot();

if (first.size !== second.size) {
    throw new Error(
        "Generated file set changed between consecutive generations.",
    );
}
for (const [path, contents] of first) {
    if (!second.has(path) || !contents.equals(second.get(path))) {
        throw new Error(`Generated output is not reproducible: ${path}`);
    }
}
console.log(`Reproducible generation verified for ${second.size} files.`);
