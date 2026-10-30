const fs = require("fs");
const path = require("path");


const SUPPORTED_EXTENSIONS = new Set([
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".mjs",
    ".cjs",
    ".py",
    ".java",
    ".c",
    ".cpp",
    ".h",
    ".hpp",
    ".go",
    ".rs",
    ".php",
    ".rb",
    ".vue",
    ".svelte"
]);


const IGNORED_DIRECTORIES = new Set([
    "node_modules",
    ".git",
    "dist",
    "build",
    "coverage",
    ".next",
    ".vite",
    "vendor"
]);

function scanRepository(repositoryPath) {
    const files = [];

    function walkDirectory(currentPath) {
        const entries = fs.readdirSync(currentPath, {
            withFileTypes: true
        });

        for (const entry of entries) {
            const fullPath = path.join(currentPath, entry.name);

            if (entry.isDirectory()) {
                if (IGNORED_DIRECTORIES.has(entry.name)) {
                    continue;
                }

                walkDirectory(fullPath);
            } else if (entry.isFile()) {
                const extension = path.extname(entry.name);

                if (SUPPORTED_EXTENSIONS.has(extension)) {
                    files.push({
                        filePath: fullPath,
                        extension
                    });
                }
            }
        }
    }

    walkDirectory(repositoryPath);

    return files;
}


const repositoryPath = process.argv[2];

if (!repositoryPath) {
    console.error(
        'Usage: node src/scanner.js "<repository-path>"'
    );
    process.exit(1);
}

const resolvedPath = path.resolve(repositoryPath);

if (!fs.existsSync(resolvedPath)) {
    console.error("Error: Repository path does not exist.");
    process.exit(1);
}

if (!fs.statSync(resolvedPath).isDirectory()) {
    console.error("Error: The repository path must be a directory.");
    process.exit(1);
}

try {
    const files = scanRepository(resolvedPath);

    console.log(`\nRepository: ${resolvedPath}`);
    console.log(`Total source files found: ${files.length}\n`);

    for (const file of files) {
        console.log(
            `${path.relative(resolvedPath, file.filePath)} (${file.extension})`
        );
    }
} catch (error) {
    console.error("Failed to scan repository:", error.message);
    process.exit(1);
}