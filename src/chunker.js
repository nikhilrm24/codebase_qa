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

// Extract functions, classes, and methods from the AST
function extractCodeChunks(ast, code, relativeFilePath) {
    const chunks = [];

    function addChunk(node, name, type) {
        if (
            typeof node.start !== "number" ||
            typeof node.end !== "number" ||
            !node.loc
        ) {
            return;
        }

        const codeText = code.slice(node.start, node.end).trim();

        if (!codeText) {
            return;
        }

        chunks.push({
            name,
            type,
            filePath: relativeFilePath,
            startLine: node.loc.start.line,
            endLine: node.loc.end.line,
            code: codeText
        });
    }

    function getPropertyName(node) {
        if (!node) return null;

        if (
            node.type === "Identifier" ||
            node.type === "PrivateName"
        ) {
            return node.type === "PrivateName"
                ? `#${node.id.name}`
                : node.name;
        }

        if (node.type === "StringLiteral") {
            return node.value;
        }

        if (node.type === "NumericLiteral") {
            return String(node.value);
        }

        return null;
    }

    function visit(node, parent = null, parentKey = null) {
        if (!node || typeof node.type !== "string") {
            return;
        }

        // Named function declarations
        if (node.type === "FunctionDeclaration") {
            addChunk(
                node,
                node.id ? node.id.name : "anonymous_function",
                "function"
            );
        }

        // Class declarations
        else if (node.type === "ClassDeclaration") {
            addChunk(
                node,
                node.id ? node.id.name : "anonymous_class",
                "class"
            );
        }

        // Named or anonymous class methods
        else if (
            node.type === "ClassMethod" ||
            node.type === "ClassPrivateMethod" ||
            node.type === "ObjectMethod"
        ) {
            const methodName = getPropertyName(node.key);

            if (methodName) {
                addChunk(node, methodName, "method");
            }
        }

        // Functions assigned to variables, such as:
        // const fetchUsers = async () => { ... }
        else if (
            node.type === "VariableDeclarator" &&
            node.init &&
            (
                node.init.type === "ArrowFunctionExpression" ||
                node.init.type === "FunctionExpression"
            )
        ) {
            const variableName =
                node.id.type === "Identifier"
                    ? node.id.name
                    : "anonymous_function";

            addChunk(node.init, variableName, "function");
        }

        // Continue exploring nested AST nodes
        for (const key of Object.keys(node)) {
            if (
                key === "loc" ||
                key === "start" ||
                key === "end" ||
                key === "extra" ||
                key === "leadingComments" ||
                key === "trailingComments" ||
                key === "innerComments" ||
                key === "comments" ||
                key === "tokens" ||
                key === "errors"
            ) {
                continue;
            }

            const value = node[key];

            if (Array.isArray(value)) {
                for (const child of value) {
                    visit(child, node, key);
                }
            } else if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    }

    visit(ast);

    // Remove exact duplicate chunks, if any
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

    return uniqueChunks;
}

// Scan and parse the entire repository
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