const fs = require("fs");
const path = require("path");
const { parse } = require("@babel/parser");


const SUPPORTED_EXTENSIONS = new Set([
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".ts",
    ".tsx"
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


function findSourceFiles(directory) {
    const results = [];

    function walk(currentDirectory) {
        const entries = fs.readdirSync(currentDirectory, {
            withFileTypes: true
        });

        for (const entry of entries) {
            const fullPath = path.join(
                currentDirectory,
                entry.name
            );

            if (entry.isDirectory()) {
                if (IGNORED_DIRECTORIES.has(entry.name)) {
                    continue;
                }

                walk(fullPath);
            } else if (
                entry.isFile() &&
                SUPPORTED_EXTENSIONS.has(path.extname(entry.name))
            ) {
                results.push(fullPath);
            }
        }
    }

    walk(directory);

    return results;
}

// Parse source code into an Abstract Syntax Tree
function parseSourceCode(code, extension) {
    const plugins = [];

    if ([".jsx", ".tsx"].includes(extension)) {
        plugins.push("jsx");
    }

    if ([".ts", ".tsx"].includes(extension)) {
        plugins.push("typescript");
    }

    return parse(code, {
        sourceType: "unambiguous",
        plugins,
        errorRecovery: false
    });
}


function extractCodeChunks(ast, code, relativeFilePath) {
    const chunks = [];

    // 1. Extract code and store its metadata
    function addChunk(node, name, type) {
        if (
            node.start == null ||
            node.end == null ||
            !node.loc
        ) {
            return;
        }

        const chunkCode = code
            .slice(node.start, node.end)
            .trim();

        if (!chunkCode) {
            return;
        }

        chunks.push({
            name,
            type,
            filePath: relativeFilePath,
            startLine: node.loc.start.line,
            endLine: node.loc.end.line,
            code: chunkCode
        });
    }

    // 2. Extract property or method names
    function getPropertyName(node) {
        if (!node) {
            return null;
        }

        if (node.type === "Identifier") {
            return node.name;
        }

        if (node.type === "PrivateName") {
            return node.id.name;
        }

        if (
            node.type === "StringLiteral" ||
            node.type === "NumericLiteral"
        ) {
            return String(node.value);
        }

        return null;
    }

    // 3. Traverse the AST and identify code chunks
    function visit(node) {
        if (!node || typeof node.type !== "string") {
            return;
        }

        // Function declarations
        if (node.type === "FunctionDeclaration") {
            addChunk(
                node,
                node.id ? node.id.name : "anonymous",
                "function"
            );
        }

        // Class declarations
        else if (node.type === "ClassDeclaration") {
            addChunk(
                node,
                node.id ? node.id.name : "anonymous",
                "class"
            );
        }

        // Class methods and object methods
        else if (
            node.type === "ClassMethod" ||
            node.type === "ClassPrivateMethod" ||
            node.type === "ObjectMethod"
        ) {
            addChunk(
                node,
                getPropertyName(node.key) || "anonymous",
                "method"
            );
        }

        // Functions assigned to variables
        else if (
            node.type === "VariableDeclarator" &&
            node.init &&
            (
                node.init.type === "ArrowFunctionExpression" ||
                node.init.type === "FunctionExpression"
            )
        ) {
            addChunk(
                node.init,
                node.id.type === "Identifier"
                    ? node.id.name
                    : "anonymous",
                "function"
            );
        }

        // 4. Visit child nodes recursively
        for (const key of Object.keys(node)) {
            if (
                [
                    "loc",
                    "start",
                    "end",
                    "extra",
                    "leadingComments",
                    "trailingComments",
                    "innerComments",
                    "comments",
                    "tokens",
                    "errors"
                ].includes(key)
            ) {
                continue;
            }

            const child = node[key];

            if (Array.isArray(child)) {
                for (const item of child) {
                    visit(item);
                }
            } else if (child && typeof child === "object") {
                visit(child);
            }
        }
    }

    // 5. Start traversal from the root AST node
    visit(ast);

    // 6. Remove duplicate chunks
    const uniqueChunks = [];
    const seen = new Set();

    for (const chunk of chunks) {
        const key = [
            chunk.filePath,
            chunk.startLine,
            chunk.endLine,
            chunk.type,
            chunk.name
        ].join(":");

        if (!seen.has(key)) {
            seen.add(key);
            uniqueChunks.push(chunk);
        }
    }

    // 7. Return the extracted chunks
    return uniqueChunks;
}



function chunkRepository(repositoryPath) {
    const absoluteRepositoryPath = path.resolve(repositoryPath);

    if (!fs.existsSync(absoluteRepositoryPath)) {
        throw new Error(
            `Repository does not exist: ${absoluteRepositoryPath}`
        );
    }

    if (!fs.statSync(absoluteRepositoryPath).isDirectory()) {
        throw new Error("Repository path must be a directory.");
    }

    const files = findSourceFiles(absoluteRepositoryPath);

    const allChunks = [];
    const parseErrors = [];

    for (const filePath of files) {
        try {
            const code = fs.readFileSync(filePath, "utf8");
            const extension = path.extname(filePath);
            const ast = parseSourceCode(code, extension);

            const relativeFilePath = path
                .relative(absoluteRepositoryPath, filePath)
                .split(path.sep)
                .join("/");

            const chunks = extractCodeChunks(
                ast,
                code,
                relativeFilePath
            );

            allChunks.push(...chunks);
        } catch (error) {
            parseErrors.push({
                filePath: path.relative(
                    absoluteRepositoryPath,
                    filePath
                ),
                error: error.message
            });
        }
    }

    return {
        totalFiles: files.length,
        totalChunks: allChunks.length,
        chunks: allChunks,
        parseErrors
    };
}

// Run from the terminal
const repositoryPath = process.argv[2];

if (require.main === module) {
    const repositoryPath = process.argv[2];

    if (!repositoryPath) {
        console.error(
            'Usage: node src/chunker.js "<repository-path>"'
        );
        process.exit(1);
    }

try {
    const result = chunkRepository(repositoryPath);

    console.log("\n========== CODEBASE SCAN ==========");
    console.log(`Source files found: ${result.totalFiles}`);
    console.log(`Code chunks extracted: ${result.totalChunks}`);
    console.log(`Files with parsing errors: ${result.parseErrors.length}`);

    console.log("\n========== SAMPLE CHUNKS ==========");

    for (const chunk of result.chunks.slice(0, 10)) {
        console.log("\n-----------------------------------");
        console.log(`Name: ${chunk.name}`);
        console.log(`Type: ${chunk.type}`);
        console.log(`File: ${chunk.filePath}`);
        console.log(
            `Lines: ${chunk.startLine}-${chunk.endLine}`
        );
        console.log("Code:");
        console.log(chunk.code);
    }

    if (result.parseErrors.length > 0) {
        console.log("\n========== PARSING ERRORS ==========");

        for (const item of result.parseErrors.slice(0, 10)) {
            console.log(`\nFile: ${item.filePath}`);
            console.log(`Error: ${item.error}`);
        }
    }
} catch (error) {
    console.error("Failed to scan repository:", error.message);
    process.exit(1);
}
}
module.exports = {
    chunkRepository
};