import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';

interface RefactorPair {
	source: string;
	replacement: string;
}

interface Refactor {
	pairs: RefactorPair[];
}

interface FileInput {
	fsPath: string
}

const refactors: Refactor[] = [];

export function activate(context: vscode.ExtensionContext) {
	const disposable = vscode.commands.registerCommand('copy-paste.copyPaste', async (file?: FileInput) => {
		try {
			await runCopyPasteCommand(file);
		} catch (err) {
			console.error(err);
			vscode.window.showErrorMessage((err as Error).message);
		}
	});

	context.subscriptions.push(disposable);
}

export function deactivate() { }

async function runCopyPasteCommand(file?: FileInput) {
	if (file?.fsPath) {
		const isDir = await fs.stat(file.fsPath).then(file => file.isDirectory()).catch(() => false);
		if (!isDir) {
			throw new Error(`${file.fsPath} is not a directory`);
		}

		const refactor = await askForRefactor();
		await refactorDir(file.fsPath, path.dirname(file.fsPath), refactor);
	} else {
		const refactor = await askForRefactor();
		const selection = await getSelection();
		await applyRefactorToSelection(selection, refactor);
	}
}

async function refactorDir(dirName: string, rootDir: string, refactor: Refactor) {
	// `recursive: true` is available only on node@20
	for (const dirent of await fs.readdir(dirName, { withFileTypes: true })) {
		// `.dirent.path` is available only on node@20
		if (dirent.isDirectory()) {
			await refactorDir(`${dirName}/${dirent.name}`, rootDir, refactor);
		} else {
			const filePath = `${dirName}/${dirent.name}`;
			const content = await fs.readFile(filePath, 'utf-8');

			const filePathWithoutRootDir = filePath.replace(rootDir, '');
			const newFilePath = `${rootDir}${refactorString(filePathWithoutRootDir, refactor)}`;
			const newContent = refactorString(content, refactor);

			console.log({ filePath, newFilePath, content, newContent });

			await fs.mkdir(path.dirname(newFilePath), { recursive: true });
			await fs.writeFile(newFilePath, newContent);
		}
	}
}

async function askForRefactor() {
	return refactors.length > 0 ? await askFromExistingRefactors() : await askForNewRefactor();
}

async function askFromExistingRefactors() {
	const items: vscode.QuickPickItem[] = [
		...refactors.map((refactor, index) => ({
			description: index.toString(),
			label: refactor.pairs.map(pair => `${pair.source} -> ${pair.replacement}`).join(','),

		})),
		{ label: 'create new', description: 'new' }
	];

	const result = await vscode.window.showQuickPick(items);
	if (result?.description === 'new') {
		return askForNewRefactor();
	} else if (result?.description) {
		return refactors[parseInt(result.description)];
	} else {
		throw new Error(`impossible state`);
	}
}

async function askForNewRefactor() {
	const input = await vscode.window.showInputBox({
		prompt: 'Set replacements pairs',
		placeHolder: "channels groups channel group",
		value: ''
	});

	const refactor = parseInput(input || '');
	refactors.push(refactor);

	return refactor;
}

async function getSelection() {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		throw new Error(`editor is empty`);
	}

	const selection = editor.selection;
	if (!selection || selection.isEmpty) {
		throw new Error(`selection is empty`);
	}

	const range = new vscode.Range(selection.start.line, selection.start.character, selection.end.line, selection.end.character);
	const text = editor.document.getText(range);

	return {
		editor,
		range,
		text,
	}
}

async function applyRefactorToSelection(selection: { editor: vscode.TextEditor, range: vscode.Range, text: string }, refactor: Refactor) {
	const newText = refactorString(selection.text, refactor);
	await selection.editor.edit(editBuilder => {
		editBuilder.replace(selection.range, newText);
	});
}

function refactorString(text: string, refactor: Refactor) {
	return refactor.pairs.reduce((acc, pair) => acc.replace(
		new RegExp(pair.source, 'g'),
		pair.replacement
	), text);
}

function parseInput(input: string) {
	const chunks = input.split(' ');
	if (chunks.length === 0 || chunks.length % 2 !== 0) {
		throw new Error(`can't parse "${input}"`);
	}

	const refactor: Refactor = { pairs: [] }
	for (let i = 0; i < chunks.length; i += 2) {
		refactor.pairs.push({
			source: upperFirst(chunks[i]),
			replacement: upperFirst(chunks[i + 1]),
		}, {
			source: chunks[i],
			replacement: chunks[i + 1],
		});
	}

	return refactor;
}

function upperFirst(text: string) {
	return text[0].toUpperCase() + text.slice(1);
}
