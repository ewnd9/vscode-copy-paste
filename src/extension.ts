import * as vscode from 'vscode';

interface RefactorPair {
	source: string;
	replacement: string;
}

interface Refactor {
	pairs: RefactorPair[];
}

const refactors: Refactor[] = [];

export function activate(context: vscode.ExtensionContext) {
	const disposable = vscode.commands.registerCommand('copy-paste.copyPaste', async () => {
		try {
			await runCopyPasteCommand();
		} catch (err) {
			console.error(err);
			vscode.window.showErrorMessage((err as Error).message);
		}
	});

	context.subscriptions.push(disposable);
}

export function deactivate() { }

async function runCopyPasteCommand() {
	const input = await vscode.window.showInputBox({
		placeHolder: "Search query",
		prompt: "Run replacements pairs",
		value: 'ge'
	});

	const refactor = parseInput(input || '');
	refactors.push(refactor);

	await applyRefactor(refactor);
}

async function applyRefactor(refactor: Refactor) {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		throw new Error(`editor is empty`);
	}

	const selection = editor.selection;
	if (selection && !selection.isEmpty) {
		const selectionRange = new vscode.Range(selection.start.line, selection.start.character, selection.end.line, selection.end.character);

		const highlighted = editor.document.getText(selectionRange);
		const newText = highlighted.replace(new RegExp(refactor.pairs[0].source, 'g'), refactor.pairs[0].replacement);

		await editor.edit(editBuilder => {
			editBuilder.replace(selectionRange, newText);
		});
	}
}

function parseInput(input: string) {
	const chunks = input.split(' ');
	if (chunks.length === 0 || chunks.length % 2 !== 0) {
		throw new Error(`can't parse "${input}"`);
	}

	const refactor: Refactor = { pairs: [] }
	for (let i = 0; i < chunks.length; i += 2) {
		refactor.pairs.push({
			source: chunks[i],
			replacement: chunks[i + 1],
		});
	}

	return refactor;
}
