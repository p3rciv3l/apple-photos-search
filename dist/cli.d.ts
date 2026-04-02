#!/usr/bin/env node
import { Command } from 'clipanion';
export declare class IndexCommand extends Command {
    static paths: string[][];
    static usage: import("clipanion").Usage;
    target: string;
    execute(): Promise<void>;
}
export declare class SearchCommand extends Command {
    static paths: string[][];
    static usage: import("clipanion").Usage;
    query: string;
    target: string;
    max: string;
    print: boolean;
    execute(): Promise<void>;
}
export declare class ListIndexCommand extends Command {
    static paths: string[][];
    static usage: import("clipanion").Usage;
    execute(): Promise<void>;
}
export declare class RemoveIndexCommand extends Command {
    static paths: string[][];
    static usage: import("clipanion").Usage;
    target: string;
    execute(): Promise<void>;
}
