'use strict';
import { commands, ConfigurationChangeEvent } from 'vscode';
import { configuration, LineHistoryViewConfig, ViewsConfig } from '../configuration';
import { CommandContext, setCommandContext } from '../constants';
import { Container } from '../container';
import { LineHistoryTrackerNode } from './nodes';
import { ViewBase } from './viewBase';

export class LineHistoryView extends ViewBase<LineHistoryTrackerNode> {
    constructor() {
        super('gitlens.views.lineHistory', 'Line History');
    }

    getRoot() {
        return new LineHistoryTrackerNode(this);
    }

    protected get location(): string {
        return this.config.location;
    }

    protected registerCommands() {
        void Container.viewCommands;
        commands.registerCommand(this.getQualifiedCommand('refresh'), () => this.refresh(true), this);
        commands.registerCommand(this.getQualifiedCommand('changeBase'), () => this.changeBase(), this);
        commands.registerCommand(
            this.getQualifiedCommand('setEditorFollowingOn'),
            () => this.setEditorFollowing(true),
            this
        );
        commands.registerCommand(
            this.getQualifiedCommand('setEditorFollowingOff'),
            () => this.setEditorFollowing(false),
            this
        );
        commands.registerCommand(
            this.getQualifiedCommand('setRenameFollowingOn'),
            () => this.setRenameFollowing(true),
            this
        );
        commands.registerCommand(
            this.getQualifiedCommand('setRenameFollowingOff'),
            () => this.setRenameFollowing(false),
            this
        );
    }

    protected onConfigurationChanged(e: ConfigurationChangeEvent) {
        if (
            !configuration.changed(e, configuration.name('views')('lineHistory').value) &&
            !configuration.changed(e, configuration.name('views').value) &&
            !configuration.changed(e, configuration.name('defaultGravatarsStyle').value) &&
            !configuration.changed(e, configuration.name('advanced')('fileHistoryFollowsRenames').value)
        ) {
            return;
        }

        if (configuration.changed(e, configuration.name('views')('lineHistory')('enabled').value)) {
            setCommandContext(CommandContext.ViewsLineHistoryEditorFollowing, true);
        }

        if (configuration.changed(e, configuration.name('views')('lineHistory')('location').value)) {
            this.initialize(this.config.location);
        }

        if (!configuration.initializing(e) && this._root !== undefined) {
            void this.refresh(true);
        }
    }

    get config(): ViewsConfig & LineHistoryViewConfig {
        return { ...Container.config.views, ...Container.config.views.lineHistory };
    }

    private changeBase() {
        if (this._root !== undefined) {
            void this._root.changeBase();
        }
    }

    private setEditorFollowing(enabled: boolean) {
        setCommandContext(CommandContext.ViewsLineHistoryEditorFollowing, enabled);
        if (this._root !== undefined) {
            this._root.setEditorFollowing(enabled);
        }
    }

    private setRenameFollowing(enabled: boolean) {
        return configuration.updateEffective(
            configuration.name('advanced')('fileHistoryFollowsRenames').value,
            enabled
        );
    }
}
