import { getApiKey } from "../lib/secrets.ts";

export default function SecretPage() {
  return <p>API key: {getApiKey()}</p>;
}
