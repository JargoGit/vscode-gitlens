'use strict';
import { Functions } from '../../system';
import { Disposable, Event, EventEmitter, RelativePattern, Uri, workspace, WorkspaceFolder } from 'vscode';

export enum RepositoryChange {
    // FileSystem = 'file-system',
    Repository = 'repository',
    Stashes = 'stashes'
}

export class RepositoryChangeEvent {

    readonly changes: RepositoryChange[] = [];

    constructor(public repository?: Repository) { }

    changed(change: RepositoryChange, solely: boolean = false) {
        if (solely) return this.changes.length === 1 && this.changes[0] === change;

        return this.changes.includes(change);

        // const changed = this.changes.includes(change);
        // if (changed) return true;

        // if (change === RepositoryChange.Repository) {
        //     return this.changes.includes(RepositoryChange.Stashes);
        // }

        // return false;
    }
}

export interface RepositoryFileSystemChangeEvent {
    repository?: Repository;
    uris: Uri[];
}

export enum RepositoryStorage {
    StatusNode = 'statusNode'
}

export class Repository extends Disposable {

    private _onDidChange = new EventEmitter<RepositoryChangeEvent>();
    get onDidChange(): Event<RepositoryChangeEvent> {
        return this._onDidChange.event;
    }

    private _onDidChangeFileSystem = new EventEmitter<RepositoryFileSystemChangeEvent>();
    get onDidChangeFileSystem(): Event<RepositoryFileSystemChangeEvent> {
        return this._onDidChangeFileSystem.event;
    }

    readonly index: number;
    readonly name: string;
    readonly storage: Map<string, any> = new Map();

    private readonly _disposable: Disposable;
    private _fireChangeDebounced: ((e: RepositoryChangeEvent) => void) | undefined = undefined;
    private _fireFileSystemChangeDebounced: ((e: RepositoryFileSystemChangeEvent) => void) | undefined = undefined;
    private _fsWatchCounter = 0;
    private _fsWatcherDisposable: Disposable | undefined;
    private _pendingChanges: { repo?: RepositoryChangeEvent, fs?: RepositoryFileSystemChangeEvent } = { };
    private _suspended: boolean;

    constructor(
        private readonly folder: WorkspaceFolder,
        public readonly path: string,
        private readonly onAnyRepositoryChanged: () => void,
        suspended: boolean
    ) {
        super(() => this.dispose());

        this.index = folder.index;
        this.name = folder.name;
        this._suspended = suspended;

        const watcher = workspace.createFileSystemWatcher(new RelativePattern(folder, '**/.git/{index,HEAD,refs/stash,refs/heads/**,refs/remotes/**}'));
        this._disposable = Disposable.from(
            watcher,
            watcher.onDidChange(this.onRepositoryChanged, this),
            watcher.onDidCreate(this.onRepositoryChanged, this),
            watcher.onDidDelete(this.onRepositoryChanged, this)
        );
    }

    dispose() {
        this.stopWatchingFileSystem();

        // Clean up any disposables in storage
        for (const item of this.storage.values()) {
            if (item != null && typeof item.dispose === 'function') {
                item.dispose();
            }
        }

        this._disposable && this._disposable.dispose();
    }

    private onFileSystemChanged(uri: Uri) {
        // Ignore .git changes
        if (/\.git/.test(uri.fsPath)) return;

        this.fireFileSystemChange(uri);
    }

    private onRepositoryChanged(uri: Uri) {
        if (uri !== undefined && uri.path.endsWith('ref/stash')) {
            this.fireChange(RepositoryChange.Stashes);

            return;
        }

        this.onAnyRepositoryChanged();

        this.fireChange(RepositoryChange.Repository);
    }

    private fireChange(reason: RepositoryChange) {
        if (this._fireChangeDebounced === undefined) {
            this._fireChangeDebounced = Functions.debounce(this.fireChangeCore, 250);
        }

        if (this._pendingChanges.repo === undefined) {
            this._pendingChanges.repo = new RepositoryChangeEvent(this);
        }

        const e = this._pendingChanges.repo;

        if (!e.changes.includes(reason)) {
            e.changes.push(reason);
        }

        if (this._suspended) return;

        this._fireChangeDebounced(e);
    }

    private fireChangeCore(e: RepositoryChangeEvent) {
        this._pendingChanges.repo = undefined;

        this._onDidChange.fire(e);
    }

    private fireFileSystemChange(uri: Uri) {
        if (this._fireFileSystemChangeDebounced === undefined) {
            this._fireFileSystemChangeDebounced = Functions.debounce(this.fireFileSystemChangeCore, 2500);
        }

        if (this._pendingChanges.fs === undefined) {
            this._pendingChanges.fs = { repository: this, uris: [] };
        }

        const e = this._pendingChanges.fs;
        e.uris.push(uri);

        if (this._suspended) return;

        this._fireFileSystemChangeDebounced(e);
    }

    private fireFileSystemChangeCore(e: RepositoryFileSystemChangeEvent) {
        this._pendingChanges.fs = undefined;

        this._onDidChangeFileSystem.fire(e);
    }

    containsUri(uri: Uri) {
        return this.folder === workspace.getWorkspaceFolder(uri);
    }

    resume() {
        if (!this._suspended) return;

        this._suspended = false;

        // If we've come back into focus and we are dirty, fire the change events

        if (this._pendingChanges.repo !== undefined) {
            this._fireChangeDebounced!(this._pendingChanges.repo);
        }

        if (this._pendingChanges.fs !== undefined) {
            this._fireFileSystemChangeDebounced!(this._pendingChanges.fs);
        }
    }

    startWatchingFileSystem() {
        this._fsWatchCounter++;
        if (this._fsWatcherDisposable !== undefined) return;

        const watcher = workspace.createFileSystemWatcher(new RelativePattern(this.folder, `**`));
        this._fsWatcherDisposable = Disposable.from(
            watcher,
            watcher.onDidChange(this.onFileSystemChanged, this),
            watcher.onDidCreate(this.onFileSystemChanged, this),
            watcher.onDidDelete(this.onFileSystemChanged, this)
        );
    }

    stopWatchingFileSystem() {
        if (this._fsWatcherDisposable === undefined) return;
        if (--this._fsWatchCounter > 0) return;

        this._fsWatcherDisposable.dispose();
        this._fsWatcherDisposable = undefined;
    }

    suspend() {
        this._suspended = true;
    }
}