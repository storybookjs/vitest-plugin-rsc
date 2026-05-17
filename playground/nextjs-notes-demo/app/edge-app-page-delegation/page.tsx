import {
  redirectDelegatedAction,
  replaceRedirectDelegatedAction,
  saveDelegatedNote,
} from "./actions.ts";
import { EdgeAppPageDelegationRedirectClient } from "./redirect-client.tsx";

export default function EdgeAppPageDelegationPage() {
  void [redirectDelegatedAction, replaceRedirectDelegatedAction, saveDelegatedNote];

  return (
    <main data-testid="edge-app-page-delegation">
      <p>Edge App Page delegation fixture</p>
      <EdgeAppPageDelegationRedirectClient />
    </main>
  );
}
