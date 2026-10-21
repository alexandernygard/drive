import type { Content, DocKind } from "./types.js"

// What a new document starts as. The drive writes it into the room when the item is created, so the
// first person to open it sees the same thing as everyone after them. Keep these valid for each app.

const quote = (s: string) => JSON.stringify(s)
const jsx = (s: string) => s.replace(/[{}<>]/g, "")

export function template(kind: DocKind, name: string): Content {
  switch (kind) {
    case "doc":
      return { text: `---\ntitle: ${quote(name)}\ntheme: classic\nfooter: " | Page {{page}} of {{pages}} | "\n---\n\n` }
    case "sheet":
      return {
        files: {
          main: `import { workbook, sheet } from "@xl2/sdk"\n\nexport default workbook(${quote(name)}, [\n  sheet("Sheet 1", [], { cells: {} }),\n])\n`,
        },
      }
    case "deck":
      return {
        // JSX attribute strings have no escapes, so swap double quotes rather than escaping them.
        text: `import { Deck, Slide, Title, Subtitle } from "ppt2"\n\nexport default (\n  <Deck title="${name.replace(/"/g, "'")}" theme="midnight">\n    <Slide layout="title">\n      <Title>${jsx(name)}</Title>\n      <Subtitle>Add a subtitle</Subtitle>\n    </Slide>\n  </Deck>\n)\n`,
      }
  }
}
