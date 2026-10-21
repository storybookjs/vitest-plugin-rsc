// A file to save, which a browser downloads under the name it says.
export function GET() {
  return new Response("id,title\n1,Groceries\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="notes.csv"',
    },
  });
}
