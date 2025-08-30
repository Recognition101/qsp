//
//
// ## Panel UI Configuration Types

/** The JSON configuration file imported by the UI. */
export type PanelConfig = {
    /**
     * A map of buttons (templates) for inheritance, not displayed in the UI.
     * Setting the `is` property in a `PanelButton` to a key name from this
     * map makes the first button inherit default values from the
     * corresponding button in this map.
     */
    templates?: { [id: string]: PanelButton };
    /** The set of buttons (and sub-panels) to display to the user. */
    root: Panel;
};

/** A set of buttons to display for the user. */
export type Panel = {
    /** The title describing this collection of buttons. */
    title: string;
    /** The list of buttons to present. */
    buttons?: PanelButton[];
    /** A list of sub-panels to present under this one's buttons. */
    children?: Panel[];
};

/** A single button that makes an HTTP request when activated. */
export type PanelButton = {
    /** The text describing this button (presented to the user). */
    text: string;

    /**
     * The name of a button in the `PanelConfig`'s `templates` map.
     * The template's values are used in place of missing ones in this button.
     * For example, if `is`: `MyKey` and `proxyValue` is not set, the system
     * will instead use `panelConfig.templates.MyKey.proxyValue`.
     */
    is?: string;
    /** A mapping of variable names to values for string expansion. */
    set?: { [key: string]: string };
    /** A list mapping numeric-indices to values for string expansion. */
    setList?: string[];
    /** A list of inputs to present to the user to fill `set`. */
    arguments?: ArgumentSchema[];

    /** The time (in ms) before a held button re-activates. */
    repeat?: number;
    /** The time (in ms) before the first re-activation of a held button. */
    repeatInitial?: number;
    /** The index of the column this button must be presented in. */
    column?: number;
    /** If set to `true`, the HTTP response will be presented to the user. */
    showOutput?: boolean;

    /** The HTTP request to make when this button is activated. */
    request?: HttpCallRequest;

    /** If given, proxy all HTTP requests through this URL. */
    proxyUrl?: string;

    /** The name of the command to run when this button is activated. */
    command?: string;
    /** The URL listing all commands and their corresponding arguments. */
    commandUrl?: string;
    /** Set to true for long-running commands to indicate streaming output. */
    isPersisted?: boolean;
};

/** A description of an HTTP request. */
export type HttpCallRequest = {
    /** The HTTP verb/method to use, ex: 'POST', 'GET', etc. */
    method: string;
    /** The URL to request, ex: 'https://example.com:1234/folder/'. */
    url: string;
    /** A mapping of header names to their values to add. */
    headers?: { [key: string]: string };
    /** The HTTP body to use (ex: for a 'POST' request). */
    body?: string;
};

//
//
// ## `qsp.js` Configuration Types

/** The JSON configuration file read by the `qsp.js` server. */
export type QspServerConfig = {
    /** A list of commands that `qsp.js` allows to be executed. */
    commands?: QspServerConfigCommand[];
};

/** A description of a command provided by the `qsp.js` server. */
export type QspServerConfigCommand = {
    /** The name of the command. */
    name: string;
    /** A list of arguments the user can edit. */
    arguments?: ArgumentSchema[];
    /** The current working directory for this command. */
    cwd?: string;
    /**
     * The command bin name to run followed by arguments to pass to it.
     * Arguments (and the command name) can contain argument references which
     * will be replaced by the argument's value. For Example:
     * - Given Aruments: `{ "a": "-l", "b": "a" }`
     * - Runner: ["ls", "${a}", "-${b}h"]
     * Will run: `ls -l -ah` (note the second argument's concatenation).
     */
    runner: string[];
};

//
//
// ## QSP Protocol Types: Server Inputs

/** A request to run a command with a particular name and set of arguments. */
export type CommandRequest = {
    /** The name of the command to run. */
    name: string;
    /** The set of arguments to provide to the command. */
    arguments: { [key: string]: string };
    /** If true, return a `pid` immediately and keep the command running. */
    isPersisted?: boolean | undefined;
};

//
//
// ## QSP Protocol Types: Server Outputs

/** A description of a command. */
export type CommandSchema = {
    /** The name of the command to run. */
    name: string;
    /** A list of arguments the user can edit. */
    arguments?: ArgumentSchema[];
};

/** A description of an argument to be input by the user. */
export type ArgumentSchema = {
    /** The key used for replacements in `ConfigCommand`'s `runner`. */
    key: string;
    /** Information describing the purpose of the argument to the user. */
    info: string;
    /** If given, the argument value must be one of these options. */
    values?: string[];
};

/** A description of a completed or in progress task (process/run command). */
export type Task = {
    /** A unique ID that identifies this task. */
    pid: string;
    /** A description of the request that initiated the task. */
    request: CommandRequest;
    /** A description of output generated until now. */
    results: TaskResults;
};

/** A description of a task's output. */
export type TaskResults = {
    /** The standard output of the task. */
    out: string;
    /** The standard error of the task. */
    error: string;
    /** The time that this task began. */
    timeStart: number;
    /** The time that this task ended (or `null` if it is in progress). */
    timeEnd: number | null;
    /** The exit code the task ended with (or `null` if it is in progress). */
    code: number | null;
};

/** A description of an error that occurred in the QSP server. */
export type ErrorResponse = {
    /** The failure indication. */
    status: 'error';
    /** A human-readable description of the problem. */
    message: string;
    /**
     * The kind of failure that occurred.
     * - `command-name`: There is no command with the requested name.
     * - `command-json`: The JSON requesting a command be run is invalid.
     * - `command-bin`: There is no binary found for a particular command.
     * - `task-pid`: There is no task with the requested PID.
     * - `proxy-json`: The JSON describing a proxy request is invalid.
     * - `proxy-response`: The proxied request failed in some way.
     */
    type:
        | 'command-name'
        | 'command-json'
        | 'command-bin'
        | 'task-pid'
        | 'proxy-json'
        | 'proxy-response';
};

//
//
// ## `qsp.js` Internal Helper Types

export type ResponderContext = {
    config: QspServerConfig;
    mdCss: string;
    local: string | null;
};

export type FileNameMetadata = {
    /** The filename in full, ex: `The Simpsons S01E02.mkv` */
    name: string;
    /** The prefix all files in a group share, ex: `The Simpsons S01` */
    prefix: string;
    /** The suffix distinguishing this member of a group, ex: `E02.mkv` */
    suffix: string;
    /** The (always lowercase) filetype of the name, ex: `mkv` */
    type: string;
};


//
//
// ## Panel UI Internal Helper Types

export type ClientApp = {
    output: string;
    input: PanelButton | null;
    pidUrl: string | null;
    pidUpdater: AbortController | null;
    heldButtons: Map<PanelButton, AbortController>;
    commandUrls: Set<string>;
    commandMap: Map<string, ClientCommandSet>;
    tasks: Map<string, ClientTaskList>;
    config: PanelConfig;
    showProcess: (commandUrl: string, pid: string) => void;
    showOutput: (output: string) => void;
    showInput: (button: PanelButton) => void;
    showErrorModal: (message: string, error: unknown) => void;
    updateTaskList: () => void;
    onError: (error: unknown) => void;
};

export type ClientCommandSet = {
    loader: Promise<CommandSchema[]|null>;
    commands: CommandSchema[] | null;
};

export type ClientTaskList = {
    url: string;
    loader: Promise<Task[]|null>;
    tasks: Task[] | null;
};

//
//
// ## Panel UI Internal Helper Types: Verification

export type IsA<T> = (context: IsContext) => T;
export type IsContext = {
    key?: string;
    value: any;
}

//
//
// ## Panel UI Internal Helper Types: DOM Manipulation

export interface EventLike {
    type: string;
    target: EventTarget | null;
    noPropagation?: boolean;
}

export type HtmlHandler<T extends keyof HTMLElementTagNameMap> =
    (ev: EventLike, target: HTMLElementTagNameMap[T]) =>
        boolean | void | Promise<boolean|void>;

type HtmlStyle = { [ key in keyof CSSStyleDeclaration & string ]?: string };

/** Extra attributes our `h` DOM-construction function can set. */
type HtmlAdditionExtras<T extends keyof HTMLElementTagNameMap, R> = {
    class: {[key: string]: boolean};
    /** A map of data-[key]s to the attribute values to add. */
    dataset: {[key: string]: string};
    /** A list of class names to add to this element. */
    classList: (string|null)[];
    /** Placeholder text to add to this input element. */
    placeholder: string;
    /** Safari only, enables or disables spelling corrections */
    autocorrect: "on" | "off";
    /** Ability to set style properties. */
    style: HtmlStyle & { [key: `--${string}`]: string };
    /** Aria attributes */
    role:
        | "alert" | "application" | "article" | "banner" | "button"
        | "cell" | "checkbox" | "comment" | "complementary"
        | "contentinfo" | "dialog" | "document" | "feed" | "figure"
        | "form" | "grid" | "gridcell" | "heading" | "img" | "list"
        | "listbox" | "listitem" | "main" | "mark" | "navigation"
        | "region" | "row" | "rowgroup" | "search" | "suggestion"
        | "switch" | "tab" | "table" | "tabpanel" | "text" | "textbox"
        | "timer" | "combobox";
    ariaLabel: string;
    ariaHidden: boolean;
    ariaChecked: "true" | "false";
    ariaDescribedby: string;
    ariaLabelledby: string;
    ariaAutocomplete: string;
    ariaOwns: string;
    disabled: "disabled";
    selected: "selected";
    checked: "checked" | "";
    for: string;
    onPostRender: HtmlHandler<T>;
    key: string;
    focused: boolean;
    /** If given, use these options when localizing the element. */
    locale: R;
};

type GetEventNames<T extends string> = T extends `on${infer N}` ? N : never;
type HtmlAllElements = HTMLElementTagNameMap[keyof HTMLElementTagNameMap];
type HtmlAllEventNames = GetEventNames<keyof HtmlAllElements>;
type HtmlAdditionLocalHandlers<T extends keyof HTMLElementTagNameMap> = {
    [key in `on${Capitalize<HtmlAllEventNames>}`]: HtmlHandler<T>;
};
type HtmlAdditionGlobalHandlers<T extends keyof HTMLElementTagNameMap> = {
    [key in `onGlobal${Capitalize<HtmlAllEventNames>}`]: HtmlHandler<T>;
};
type HtmlAdditions<T extends keyof HTMLElementTagNameMap, R> =
    HtmlAdditionExtras<T, R> &
    HtmlAdditionLocalHandlers<T> &
    HtmlAdditionGlobalHandlers<T>;

type HtmlOmissions<T extends keyof HTMLElementTagNameMap, R> =
    keyof HtmlAdditions<T, R> | `on${HtmlAllEventNames}`;

/** All attributes that the DOM-construction function `h` can set. */
export type HtmlAttributeSet<T extends keyof HTMLElementTagNameMap, R> =
    Partial<Omit<HTMLElementTagNameMap[T], HtmlOmissions<T, R>>> &
    Partial<HtmlAdditions<T, R>>;

/** The types of children virtual `h` can append to a created HTML Element. */
export type HtmlOptions<T extends keyof HTMLElementTagNameMap, R> =
    MaybeArray<HtmlAttributeSet<T, R> | R | string | null | undefined>;

//
//
// ## General (Non-Application Specific) Types

export type Result<E, T> =
    | { error: E; value?: undefined }
    | { error?: undefined; value: T };

export type MaybeArray<T> = T | T[];

export type Json =
    | JsonObject
    | Json[]
    | number
    | string
    | boolean
    | null;

export type JsonObject = { [key: string]: Json };
