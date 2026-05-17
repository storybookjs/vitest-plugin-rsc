import { TestPayloadClient } from "./client.tsx";

export function TestPayloadServer() {
  return (
    <div>
      <span data-testid="rsc-payload">
        <TestPayloadClient
          test1={"🙂"}
          test2={"<script>throw new Error('boom')</script>"}
          test3={new TextEncoder().encode("🔥").reverse()}
          test4={"&><\u2028\u2029"}
        />
      </span>
    </div>
  );
}
