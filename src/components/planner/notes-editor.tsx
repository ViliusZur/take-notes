"use client";

import { FontSize, TextStyle } from "@tiptap/extension-text-style";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor, useEditorState, type ChainedCommands, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  ALargeSmallIcon,
  BoldIcon,
  ChevronDownIcon,
  ItalicIcon,
  ListIcon,
  ListIndentDecreaseIcon,
  ListIndentIncreaseIcon,
  ListOrderedIcon,
  StrikethroughIcon,
  UnderlineIcon,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, type MouseEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { notesToHtml } from "@/lib/rich-text";
import { cn } from "@/lib/utils";

/** Characters of text (not counting formatting) a week's notes can hold. */
const MAX_CHARACTERS = 100_000;

/** Text sizes, relative to the notes' base size. */
const SIZES = [
  { id: "small", label: "Small", fontSize: "0.875em" },
  { id: "normal", label: "Normal", fontSize: null },
  { id: "large", label: "Large", fontSize: "1.25em" },
  { id: "huge", label: "Huge", fontSize: "1.75em" },
] as const;

type SizeId = (typeof SIZES)[number]["id"];

const OWN_FONT_SIZES = new Set<string>(SIZES.flatMap((size) => (size.fontSize ? [size.fontSize] : [])));

/** Pasted text keeps bold, lists and so on, but only the editor's own sizes, not 11pt from a word processor. */
function dropForeignFontSizes(html: string) {
  return html.replace(/font-size:\s*([^;"']*);?/gi, (declaration, value: string) =>
    OWN_FONT_SIZES.has(value.trim()) ? declaration : "",
  );
}

/** The list the cursor is directly in, so a numbered sublist inside a bulleted list shows as numbered. */
function innermostList(editor: Editor) {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const name = $from.node(depth).type.name;
    if (name === "bulletList" || name === "orderedList") return name;
  }
  return null;
}

/** Keeps the editor's focus and selection when a toolbar button is pressed. */
const keepEditorFocus = (event: MouseEvent) => event.preventDefault();

/**
 * Rich-text notes: bold, italic, underline, strikethrough, text sizes, and bulleted and numbered
 * lists nested in each other. Works with the usual shortcuts (⌘/Ctrl+B, I, U, ⌘/Ctrl+Shift+S,
 * Tab and Shift+Tab in lists) and Markdown-style typing ("- " or "1. " starts a list).
 */
export function NotesEditor({
  value,
  onChange,
  onBlur,
  label,
  autoFocus = false,
  className,
}: {
  /** The stored notes: editor HTML, or plain text from before formatting existed. */
  value: string;
  onChange: (html: string) => void;
  onBlur?: () => void;
  label: string;
  autoFocus?: boolean;
  className?: string;
}) {
  // The last value this editor produced. Any other incoming value is a change from outside to load.
  const emitted = useRef(value);
  const callbacks = useRef({ onChange, onBlur });
  useLayoutEffect(() => {
    callbacks.current = { onChange, onBlur };
  });

  const editor = useEditor({
    immediatelyRender: false,
    autofocus: autoFocus ? "end" : false,
    extensions: [
      StarterKit.configure({
        blockquote: false,
        code: false,
        codeBlock: false,
        heading: false,
        horizontalRule: false,
        link: false,
      }),
      TextStyle,
      FontSize,
      Placeholder.configure({ placeholder: "Notes, ideas, checklists…" }),
      CharacterCount.configure({ limit: MAX_CHARACTERS }),
    ],
    content: notesToHtml(value),
    editorProps: {
      attributes: {
        "aria-label": label,
        "aria-multiline": "true",
        role: "textbox",
        spellcheck: "true",
        class: "notes-content",
      },
      transformPastedHTML: dropForeignFontSizes,
    },
    onUpdate: ({ editor }) => {
      const html = editor.isEmpty ? "" : editor.getHTML();
      emitted.current = html;
      callbacks.current.onChange(html);
    },
    onBlur: () => callbacks.current.onBlur?.(),
  });

  useEffect(() => {
    if (!editor || value === emitted.current) return;
    emitted.current = value;
    editor.commands.setContent(notesToHtml(value), { emitUpdate: false });
  }, [editor, value]);

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <NotesToolbar editor={editor} />
      <EditorContent
        editor={editor}
        className="min-h-0 flex-1 cursor-text overflow-y-auto overscroll-contain pt-2 text-base leading-relaxed sm:text-[15px]"
        onMouseDown={(event) => {
          // A press below the last line puts the cursor at the end, as it would in a text area.
          if (editor && event.target === event.currentTarget) {
            event.preventDefault();
            editor.commands.focus("end");
          }
        }}
      />
    </div>
  );
}

function NotesToolbar({ editor }: { editor: Editor | null }) {
  const state = useEditorState({
    editor,
    selector: ({ editor }) => {
      if (!editor) return null;
      const fontSize: unknown = editor.getAttributes("textStyle").fontSize;
      return {
        bold: editor.isActive("bold"),
        italic: editor.isActive("italic"),
        underline: editor.isActive("underline"),
        strike: editor.isActive("strike"),
        list: innermostList(editor),
        size: SIZES.find((size) => size.fontSize === (fontSize ?? null))?.id ?? "normal",
        canIndent: editor.can().sinkListItem("listItem"),
        canOutdent: editor.can().liftListItem("listItem"),
      };
    },
  });

  const run = (command: (chain: ChainedCommands) => ChainedCommands) => {
    if (editor) command(editor.chain().focus()).run();
  };

  return (
    <div
      role="group"
      aria-label="Text formatting"
      className="-mx-2 flex shrink-0 items-center overflow-x-auto border-b border-border/70 pb-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <ToolButton label="Bold" pressed={state?.bold} disabled={!state} onClick={() => run((c) => c.toggleBold())}>
        <BoldIcon />
      </ToolButton>
      <ToolButton label="Italic" pressed={state?.italic} disabled={!state} onClick={() => run((c) => c.toggleItalic())}>
        <ItalicIcon />
      </ToolButton>
      <ToolButton
        label="Underline"
        pressed={state?.underline}
        disabled={!state}
        onClick={() => run((c) => c.toggleUnderline())}
      >
        <UnderlineIcon />
      </ToolButton>
      <ToolButton
        label="Strikethrough"
        pressed={state?.strike}
        disabled={!state}
        onClick={() => run((c) => c.toggleStrike())}
      >
        <StrikethroughIcon />
      </ToolButton>

      <ToolbarDivider />
      <SizeMenu
        size={state?.size ?? "normal"}
        disabled={!state}
        onFocusEditor={() => editor?.commands.focus()}
        onSelect={(id) => {
          const fontSize = SIZES.find((size) => size.id === id)?.fontSize;
          run((c) => (fontSize ? c.setFontSize(fontSize) : c.unsetFontSize()));
        }}
      />
      <ToolbarDivider />

      <ToolButton
        label="Bulleted list"
        pressed={state?.list === "bulletList"}
        disabled={!state}
        onClick={() => run((c) => c.toggleBulletList())}
      >
        <ListIcon />
      </ToolButton>
      <ToolButton
        label="Numbered list"
        pressed={state?.list === "orderedList"}
        disabled={!state}
        onClick={() => run((c) => c.toggleOrderedList())}
      >
        <ListOrderedIcon />
      </ToolButton>
      <ToolButton
        label="Indent into a sublist"
        disabled={!state?.canIndent}
        onClick={() => run((c) => c.sinkListItem("listItem"))}
      >
        <ListIndentIncreaseIcon />
      </ToolButton>
      <ToolButton
        label="Outdent"
        disabled={!state?.canOutdent}
        onClick={() => run((c) => c.liftListItem("listItem"))}
      >
        <ListIndentDecreaseIcon />
      </ToolButton>
    </div>
  );
}

function ToolButton({
  label,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string;
  /** Set for on/off formatting; leave out for actions. */
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      aria-pressed={pressed === undefined ? undefined : pressed}
      disabled={disabled}
      onMouseDown={keepEditorFocus}
      onClick={onClick}
      // 32px everywhere, so the whole toolbar fits a 375px-wide phone.
      className="size-8 text-muted-foreground aria-pressed:bg-tone-violet aria-pressed:text-tone-violet-fg aria-pressed:hover:bg-tone-violet aria-pressed:hover:text-tone-violet-fg"
    >
      {children}
    </Button>
  );
}

function SizeMenu({
  size,
  disabled,
  onSelect,
  onFocusEditor,
}: {
  size: SizeId;
  disabled: boolean;
  onSelect: (size: SizeId) => void;
  onFocusEditor: () => void;
}) {
  const current = SIZES.find((option) => option.id === size) ?? SIZES[1];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Text size: ${current.label}`}
          title="Text size"
          onMouseDown={keepEditorFocus}
          className={cn(
            "h-8 gap-0.5 px-1.5 text-muted-foreground has-[>svg]:px-1.5 data-[state=open]:bg-accent",
            size !== "normal" && "bg-tone-violet text-tone-violet-fg hover:bg-tone-violet hover:text-tone-violet-fg",
          )}
        >
          <ALargeSmallIcon />
          <ChevronDownIcon className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="min-w-36"
        onCloseAutoFocus={(event) => {
          // Back to writing, not to the size button.
          event.preventDefault();
          onFocusEditor();
        }}
      >
        <DropdownMenuRadioGroup value={size} onValueChange={(id) => onSelect(id as SizeId)}>
          {SIZES.map((option) => (
            <DropdownMenuRadioItem key={option.id} value={option.id}>
              <span style={option.fontSize ? { fontSize: option.fontSize } : undefined}>{option.label}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ToolbarDivider() {
  return <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />;
}
