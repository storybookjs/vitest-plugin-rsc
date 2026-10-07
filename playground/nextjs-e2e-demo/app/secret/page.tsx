// By a path of the tsconfig.
import { getApiKey } from "@/app/lib/secrets.ts";

export default function SecretPage() {
  return <p>API key: {getApiKey()}</p>;
}
