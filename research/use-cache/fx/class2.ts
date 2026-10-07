export class Repo {
  static async find(id: string) {
    "use cache";
    return id;
  }
}
export const obj = {
  async method(id: string) {
    "use cache";
    return this === undefined ? id : id;
  },
};
export default async function (id: string) {
  "use cache: custom";
  return id;
}
