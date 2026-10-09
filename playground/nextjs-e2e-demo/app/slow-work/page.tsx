import { workSlowly } from "../lib/slow-work-action.ts";
import { slowWork } from "../lib/slow-work.ts";

export default async function SlowWorkPage() {
  await Promise.resolve();
  slowWork.rendered += 1;
  return (
    <form action={workSlowly}>
      <button>Work slowly</button>
    </form>
  );
}
