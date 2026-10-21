import { describe, expect, it } from "vitest"
import { createDrive, defaultOrigins, displayName, firstName, initials, template, timeAgo } from "./index.js"

describe("templates", () => {
  it("puts the name in each app's own title", () => {
    expect(template("doc", "Q4 review").text).toContain('title: "Q4 review"')
    expect(template("sheet", "Budget").files?.main).toContain('workbook("Budget"')
    expect(template("deck", "Kickoff").text).toContain('<Deck title="Kickoff"')
  })

  it("keeps deck JSX valid when the name has quotes and braces", () => {
    const text = template("deck", 'The "big" {plan}').text!
    expect(text).toContain(`<Deck title="The 'big' {plan}"`)
    expect(text).toContain("<Title>The \"big\" plan</Title>")
  })
})

describe("people", () => {
  it("falls back to the email when there is no name", () => {
    expect(firstName({ name: null, email: "kari.nordmann@example.com" })).toBe("kari.nordmann")
    expect(displayName({ name: "Ola Nordmann", email: "ola@example.com" })).toBe("Ola Nordmann")
    expect(initials({ name: "Ola Nordmann" })).toBe("ON")
    expect(firstName(null)).toBe("Someone")
  })
})

describe("timeAgo", () => {
  it("reads naturally", () => {
    const now = Date.UTC(2026, 9, 21, 12)
    expect(timeAgo(now - 10_000, now)).toBe("just now")
    expect(timeAgo(now - 5 * 60_000, now)).toBe("5 min ago")
    expect(timeAgo(now - 3 * 3_600_000, now)).toBe("3 h ago")
  })
})

describe("client", () => {
  it("uses production origins off localhost and dev ports on it", () => {
    expect(defaultOrigins("drive.nyggis.com").api).toBe("https://drive.nyggis.com")
    expect(defaultOrigins("localhost").apps.doc).toBe("http://localhost:5273")
  })

  it("opens documents in their app, folders in the dashboard", () => {
    const drive = createDrive(defaultOrigins("drive.nyggis.com"))
    expect(drive.openUrl({ id: "abc", kind: "sheet" })).toBe("https://xl2.nyggis.com/?file=abc")
    expect(drive.openUrl({ id: "abc", kind: "folder" })).toBe("https://drive.nyggis.com/folders/abc")
    expect(drive.roomOptions("a b").url).toBe("wss://drive.nyggis.com/collab/a%20b")
  })
})
