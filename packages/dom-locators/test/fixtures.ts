// The documents of the oracle table: a page of the ARIA cases that roles,
// names and text matching have, and the pages of the notes app of
// playground/vitest-vs-playwright-notes as its routes render them.

export const ariaFixture = /* HTML */ `
  <style>
    .before::before {
      content: "Before ";
    }
    .after::after {
      content: " after";
    }
    .block-before::before {
      content: "Block";
      display: block;
    }
    .gone {
      display: none;
    }
    .invisible {
      visibility: hidden;
    }
    .contents {
      display: contents;
    }
  </style>
  <header id="page-header"><h1 id="h1">Main title</h1></header>
  <nav aria-label="Primary" id="nav-primary">
    <ul id="nav-list">
      <li id="li-home"><a id="a-home" href="/">Home</a></li>
      <li id="li-docs">
        <a id="a-docs" href="/docs"><span>Docs</span> <b>and</b> <i>guides</i></a>
      </li>
      <li id="li-icon">
        <a id="a-icon" href="/icon"><img id="img-icon" src="data:," alt="Settings" /></a>
      </li>
      <li id="li-label"><a id="a-label" href="/l" aria-label="Labelled link">Ignored text</a></li>
      <li><a id="a-nohref">No href</a></li>
      <li><a id="a-title" href="/t" title="Titled link"></a></li>
      <li>
        <a id="a-block" href="/b"
          ><div>Block</div>
          <div>link</div></a
        >
      </li>
    </ul>
  </nav>
  <nav id="nav-unnamed"><a id="a-second-home" href="/">home page</a></nav>
  <main id="main">
    <article id="article">
      <header id="article-header"><h2 id="h2">Article heading</h2></header>
      <footer id="article-footer">Article footer</footer>
    </article>
    <section id="section-unnamed"><h3 id="h3">Plain section</h3></section>
    <section id="section-named" aria-label="Named section">
      <h4 id="h4" aria-level="2">Level override</h4>
    </section>
    <div role="heading" aria-level="5" id="div-heading">Div heading</div>
    <h6 id="h6">Spaced heading</h6>
    <p id="p-text">Some <strong id="strong">strong</strong> text and a <em id="em">word</em>.</p>
    <p id="p-nbsp">Non&nbsp;breaking&#8203;space</p>
    <p id="p-dup1">Duplicate</p>
    <p id="p-dup2">duplicate</p>
    <p id="p-dup3">Duplicate text</p>
    <div id="div-nested">
      <span id="span-nested">Nested <span id="span-inner">inner</span></span>
    </div>
    <div id="gone" class="gone"><button id="b-gone">Gone button</button></div>
    <button id="b-invisible" class="invisible">Invisible button</button>
    <button id="b-hidden-attr" hidden>Hidden attribute button</button>
    <div aria-hidden="true"><button id="b-aria-hidden">ARIA hidden button</button></div>
    <div class="contents" id="contents"><button id="b-contents">Contents button</button></div>

    <button id="b-save">Save</button>
    <button id="b-save-draft">Save draft</button>
    <button id="b-span"><span>Span</span> <span>button</span></button>
    <button id="b-icon"><svg id="svg-icon" aria-label="Trash"></svg></button>
    <button id="b-aria-label" aria-label="Close dialog">×</button>
    <span id="lbl-1">Labelled</span><span id="lbl-2">by two</span>
    <button id="b-labelledby" aria-labelledby="lbl-1 lbl-2">Ignored</button>
    <button id="b-title" title="Only a title"></button>
    <button id="b-before" class="before">pseudo</button>
    <button id="b-after" class="after">pseudo</button>
    <button id="b-block-before" class="block-before">text</button>
    <button id="b-pressed" aria-pressed="true">Bold</button>
    <button id="b-pressed-mixed" aria-pressed="mixed">Italic</button>
    <button id="b-expanded" aria-expanded="true">Menu</button>
    <button id="b-collapsed" aria-expanded="false">Menu</button>
    <button id="b-disabled" disabled>Disabled</button>
    <button id="b-aria-disabled" aria-disabled="true">Aria disabled</button>
    <div aria-disabled="true" role="group" id="g-disabled">
      <button id="b-in-aria-disabled">Inside aria disabled</button>
    </div>
    <fieldset disabled id="fs-disabled">
      <legend><button id="b-legend">In legend</button></legend>
      <button id="b-fieldset">In fieldset</button>
    </fieldset>
    <div role="button" tabindex="0" id="div-button">Div button</div>
    <span role="presentation" id="span-presentation">Presentation</span>
    <button role="none" id="b-role-none">Button with role none</button>
    <ul role="none" id="ul-none">
      <li id="li-in-none">Item in none list</li>
    </ul>
    <div role="foo button" id="div-multi-role">Multi role</div>
    <img id="img-decorative" src="data:," alt="" />
    <img id="img-alt" src="data:," alt="A chart" title="Chart title" />
    <svg id="svg-plain"><title>Svg title</title></svg>
    <input type="image" id="in-image" alt="Image submit" src="data:," />

    <form aria-label="Login" id="form-named">
      <label for="in-email">Email address</label
      ><input id="in-email" type="email" placeholder="you@example.com" />
      <label>Password <input id="in-password" type="password" /></label>
      <input id="in-text" type="text" aria-label="Free text" />
      <input id="in-notype" placeholder="Type here" />
      <input id="in-title" title="Titled input" />
      <input id="in-search" type="search" aria-label="Find" />
      <input id="in-tel" type="tel" aria-labelledby="lbl-1" />
      <input id="in-url" type="url" />
      <input id="in-number" type="number" aria-label="Count" />
      <input id="in-range" type="range" aria-label="Volume" />
      <input id="in-hidden" type="hidden" aria-label="Hidden input" />
      <input id="in-submit" type="submit" value="Send form" />
      <input id="in-button" type="button" value="Input button" />
      <input id="in-reset" type="reset" />
      <textarea id="ta" aria-label="Message">Body</textarea>
      <input id="in-list" list="dl" aria-label="With list" /><datalist id="dl">
        <option value="x"></option>
      </datalist>
      <label for="multi-a" id="label-multi">Shared</label>
      <input id="multi-a" /><label for="multi-a">Second label</label>
      <input type="checkbox" id="cb-checked" checked aria-label="Checked box" />
      <input type="checkbox" id="cb-unchecked" aria-label="Unchecked box" />
      <input type="checkbox" id="cb-mixed" aria-label="Mixed box" />
      <div role="checkbox" aria-checked="true" id="div-checkbox">Div checkbox</div>
      <div role="switch" aria-checked="false" id="div-switch" aria-label="Switch"></div>
      <input type="radio" name="r" id="r-1" checked aria-label="Radio one" />
      <input type="radio" name="r" id="r-2" aria-label="Radio two" />
      <label><input type="radio" name="r" id="r-3" /> Radio three</label>
      <select id="sel" aria-label="Fruit">
        <option id="opt-apple">Apple</option>
        <option id="opt-pear" selected>Pear</option>
      </select>
      <select id="sel-multi" multiple aria-label="Fruits">
        <option id="opt-m1" selected>Kiwi</option>
        <option id="opt-m2">Lime</option>
      </select>
      <label for="sel-labelled">Choose</label
      ><select id="sel-labelled">
        <option>One</option>
      </select>
      <output id="out" aria-label="Result">42</output>
      <meter id="meter" value="0.5" aria-label="Meter"></meter>
      <progress id="progress" value="5" max="10" aria-label="Progress"></progress>
    </form>
    <form id="form-unnamed"><button id="b-submit-unnamed">Submit</button></form>

    <details id="details" open>
      <summary id="summary">More</summary>
      <p id="p-details">Details text</p>
    </details>
    <details id="details-closed">
      <summary id="summary-closed">Closed</summary>
      <p id="p-closed">Closed text</p>
    </details>
    <dialog id="dialog" open aria-label="Settings dialog"><p>Dialog text</p></dialog>
    <table id="table">
      <caption>
        Scores
      </caption>
      <thead>
        <tr id="tr-head">
          <th id="th-name" scope="col">Name</th>
          <th id="th-score">Score</th>
        </tr>
      </thead>
      <tbody>
        <tr id="tr-1">
          <th scope="row" id="th-row">Ada</th>
          <td id="td-1">10</td>
        </tr>
      </tbody>
    </table>
    <div role="grid" id="grid">
      <div role="row"><div role="gridcell" aria-selected="true" id="gc-1">Cell</div></div>
    </div>
    <div role="tablist">
      <div role="tab" aria-selected="true" id="tab-1">First tab</div>
      <div role="tab" id="tab-2">Second tab</div>
    </div>
    <ul id="tree" role="tree">
      <li role="treeitem" aria-level="1" aria-expanded="true" id="ti-1">Root</li>
    </ul>
    <hr id="hr" />
    <aside id="aside">Aside</aside>
    <blockquote id="bq">Quote</blockquote>
    <code id="code">x = 1</code>
    <time id="time">Today</time>
    <dl>
      <dt id="dt">Term</dt>
      <dd id="dd">Definition</dd>
    </dl>
    <div data-testid="card" id="card">Card <span data-testid="card-title">Card title</span></div>
    <div data-testid="Card" id="card-upper">Upper card</div>
    <div data-test-id="other" id="other-testid">Other attribute</div>
    <div title="Tooltip text" id="div-title">Has title</div>
    <script>
      /* Script text */
    </script>
    <div id="shadow-host" role="group" aria-label="Shadow group">
      <template shadowrootmode="open">
        <button id="b-shadow">Shadow button</button>
        <p id="p-shadow">Shadow text <slot></slot></p>
        <a id="a-shadow" href="/shadow">Shadow link</a>
        <div id="nested-host">
          <template shadowrootmode="open"
            ><button id="b-nested">Nested shadow button</button></template
          >
        </div>
        <label for="in-shadow">Shadow field</label
        ><input id="in-shadow" placeholder="In the shadow" />
      </template>
      <span id="span-slotted">Slotted text</span>
    </div>
    <div id="after-shadow"><button id="b-after-shadow">After the shadow</button></div>
    <div id="closed-host">
      <template shadowrootmode="closed"><button id="b-closed">Closed button</button></template>
    </div>
    <div id="shadow-free">The end</div>
  </main>
  <footer id="page-footer">Page footer <a href="/c" id="a-contact">Contact</a></footer>
`;

const layout = (signedIn: boolean, main: string) => /* HTML */ `
  <header>
    <nav aria-label="Main">
      ${signedIn
        ? `<a href="/notes">Notes</a> <a href="/profile">Profile</a> <span>Signed in as Ada Lovelace</span>
    <form action=""><button type="submit">Sign out</button></form>`
        : `<a href="/sign-in">Sign in</a> <a href="/sign-up">Sign up</a>`}
    </nav>
  </header>
  <main>${main}</main>
`;

const field = (
  label: string,
  name: string,
  type = "text",
  value = "",
  error?: string,
) => /* HTML */ ` <p>
  <label for="${name}">${label}</label>
  <input
    id="${name}"
    name="${name}"
    type="${type}"
    value="${value}"
    ${error ? ` aria-invalid="true" aria-describedby="${name}-error"` : ""}
  />
  ${error ? `<span id="${name}-error">${error}</span>` : ""}
</p>`;

/** The routes of the notes app, by name: what `renderServer({ url })` shows for each. */
export const notesFixtures: Record<string, string> = {
  notes: layout(
    true,
    /* HTML */ ` <output>Welcome, Ada Lovelace!</output>
      <output>Note deleted.</output>
      <h1>Notes</h1>
      <p>3 notes</p>
      <form action="/notes">
        <label for="q">Search</label>
        <input id="q" name="q" type="search" value="" />
        <button type="submit">Search</button>
      </form>
      <a href="/notes/new">New note</a>
      <ul aria-label="Notes">
        <li><a href="/notes/1">Groceries</a><span> ★ Favorite</span></li>
        <li><a href="/notes/2">Shopping</a></li>
        <li><a href="/notes/3">Notes on notes</a></li>
      </ul>`,
  ),
  empty: layout(
    true,
    /* HTML */ ` <h1>Notes</h1>
      <p>0 notes</p>
      <a href="/notes/new">New note</a>
      <p>No notes yet</p>`,
  ),
  note: layout(
    true,
    /* HTML */ ` <output>Note created.</output>
      <h1>Groceries</h1>
      <p>Oat milk, bread</p>
      <form action="">
        <input type="hidden" name="id" value="1" /><button type="submit" aria-pressed="true">
          Unfavorite
        </button>
      </form>
      <form action="">
        <input type="hidden" name="id" value="1" /><button type="submit">Delete</button>
      </form>
      <a href="/notes/1/edit">Edit</a> <a href="/notes">All notes</a>`,
  ),
  unfavorited: layout(
    true,
    /* HTML */ ` <h1>Shopping</h1>
      <p>No content yet.</p>
      <form action=""><button type="submit" aria-pressed="false">Favorite</button></form>
      <form action=""><button type="submit">Delete</button></form>
      <a href="/notes/2/edit">Edit</a> <a href="/notes">All notes</a>`,
  ),
  edit: layout(
    true,
    /* HTML */ ` <h1>Edit note</h1>
      <form action="">
        ${field("Title", "title", "text", "", "Title is required.")}
        <p>
          <label for="content">Content</label>
          <textarea id="content" name="content">Oat milk</textarea>
          <span>8 / 2000</span>
        </p>
        <button type="submit">Save note</button>
      </form>
      <a href="/notes/1">Cancel</a>`,
  ),
  signIn: layout(
    false,
    /* HTML */ ` <h1>Sign in</h1>
      <form action="">
        <output>Invalid email or password.</output>
        ${field("Email", "email", "text", "ada@example.com")}
        ${field("Password", "password", "password")}
        <button type="submit">Sign in</button>
      </form>
      <p>No account? <a href="/sign-up">Create an account</a></p>`,
  ),
  profile: layout(
    true,
    /* HTML */ ` <output>Name saved.</output>
      <h1>Profile</h1>
      <p>Email: ada@example.com</p>
      <p>You have 1 note.</p>
      <form action="">
        ${field("Name", "name", "text", "Ada Lovelace")}
        <button type="submit" disabled>Save name</button>
      </form>`,
  ),
  notFound: layout(
    false,
    /* HTML */ `<h1>404</h1>
      <h2>This page could not be found.</h2>`,
  ),
};
