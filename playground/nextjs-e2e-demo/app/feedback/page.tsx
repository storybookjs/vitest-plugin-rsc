// A form without a Server Action, which the browser posts itself, in the
// encoding of a form by default: app.test.tsx.
export default function FeedbackPage() {
  return (
    <>
      <h1>Feedback</h1>
      <form method="post" action="/">
        <label>
          Message <input name="message" defaultValue="Thanks" />
        </label>
        <button type="submit">Send</button>
      </form>
    </>
  );
}
