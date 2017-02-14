'use strict';
import { Iterables } from './system';
import { CancellationToken, CodeLens, CodeLensProvider, DocumentSelector, ExtensionContext, Range, TextDocument, Uri } from 'vscode';
import { Commands, DocumentSchemes } from './constants';
import GitProvider, { GitCommit, GitUri } from './gitProvider';

export class GitDiffWithWorkingCodeLens extends CodeLens {

    constructor(git: GitProvider, public fileName: string, public commit: GitCommit, range: Range) {
        super(range);
    }
}

export class GitDiffWithPreviousCodeLens extends CodeLens {

    constructor(git: GitProvider, public fileName: string, public commit: GitCommit, range: Range) {
        super(range);
    }
}

export default class GitRevisionCodeLensProvider implements CodeLensProvider {

    static selector: DocumentSelector = { scheme: DocumentSchemes.Git };

    constructor(context: ExtensionContext, private git: GitProvider) { }

    async provideCodeLenses(document: TextDocument, token: CancellationToken): Promise<CodeLens[]> {
        const gitUri = GitUri.fromUri(document.uri, this.git);

        const lenses: CodeLens[] = [];

        const log = await this.git.getLogForFile(gitUri.fsPath, gitUri.sha, gitUri.repoPath);
        if (!log) return lenses;

        const commit = (gitUri.sha && log.commits.get(gitUri.sha)) || Iterables.first(log.commits.values());
        if (!commit) return lenses;

        lenses.push(new GitDiffWithWorkingCodeLens(this.git, commit.uri.fsPath, commit, new Range(0, 0, 0, 1)));

        if (commit.previousSha) {
            lenses.push(new GitDiffWithPreviousCodeLens(this.git, commit.previousUri.fsPath, commit, new Range(0, 1, 0, 2)));
        }

        return lenses;
    }

    resolveCodeLens(lens: CodeLens, token: CancellationToken): Thenable<CodeLens> {
        if (lens instanceof GitDiffWithWorkingCodeLens) return this._resolveDiffWithWorkingTreeCodeLens(lens, token);
        if (lens instanceof GitDiffWithPreviousCodeLens) return this._resolveGitDiffWithPreviousCodeLens(lens, token);
        return Promise.reject<CodeLens>(undefined);
    }

    _resolveDiffWithWorkingTreeCodeLens(lens: GitDiffWithWorkingCodeLens, token: CancellationToken): Thenable<CodeLens> {
        lens.command = {
            title: `Compare (${lens.commit.sha}) with Working Tree`,
            command: Commands.DiffWithWorking,
            arguments: [
                Uri.file(lens.fileName),
                lens.commit,
                lens.range.start.line
            ]
        };
        return Promise.resolve(lens);
    }

    _resolveGitDiffWithPreviousCodeLens(lens: GitDiffWithPreviousCodeLens, token: CancellationToken): Thenable<CodeLens> {
        lens.command = {
            title: `Compare (${lens.commit.sha}) with Previous (${lens.commit.previousSha})`,
            command: Commands.DiffWithPrevious,
            arguments: [
                Uri.file(lens.fileName),
                lens.commit,
                lens.range.start.line
            ]
        };
        return Promise.resolve(lens);
    }
}