import assert from "node:assert/strict";
import test from "node:test";
import {
  isOpenCodeSessionBusyError,
  recoverableStreamedOpenCodeAnswer,
  shouldRetryBusyOpenCodeTurn,
  speechFromRecoveredOpenCodeAnswer,
} from "@/lib/opencode-reliability";

test("reconnaît les deux formes de SessionBusyError du SDK OpenCode", () => {
  assert.equal(isOpenCodeSessionBusyError(new Error("conflit"), 409), true);
  assert.equal(isOpenCodeSessionBusyError({
    data: {
      _tag: "SessionBusyError",
      sessionID: "ses_demo",
      message: "Session is busy",
    },
  }), true);
  assert.equal(isOpenCodeSessionBusyError({ status: 500, message: "Internal error" }, 500), false);
});

test("récupère une réponse complète quand seule la finalisation structurée échoue", () => {
  assert.equal(
    recoverableStreamedOpenCodeAnswer(
      "opencode_invalid_structured_output",
      "La marge baisse de 2,1 points, principalement à cause du chantier Rivoli [ALERT-201].",
    ),
    "La marge baisse de 2,1 points, principalement à cause du chantier Rivoli [ALERT-201].",
  );
  assert.equal(
    recoverableStreamedOpenCodeAnswer("opencode_request_failed", "Oui, bien sûr."),
    "Oui, bien sûr.",
  );
});

test("accepte une longue réponse presque terminée mais refuse un fragment ambigu", () => {
  const longAnswer = "L’analyse croise les données SEO, le trafic organique et les conversions. ".repeat(3).trim();
  assert.equal(
    recoverableStreamedOpenCodeAnswer("opencode_timeout", longAnswer),
    longAnswer,
  );
  assert.equal(
    recoverableStreamedOpenCodeAnswer("opencode_request_failed", "La marge de"),
    null,
  );
});

test("ne masque jamais une annulation ou une erreur de configuration", () => {
  const complete = "La réponse est complète et peut être affichée.";
  assert.equal(recoverableStreamedOpenCodeAnswer("opencode_aborted", complete), null);
  assert.equal(recoverableStreamedOpenCodeAnswer("opencode_configuration_error", complete), null);
});

test("une session occupée est retentée une seule fois et seulement avant le streaming", () => {
  assert.equal(shouldRetryBusyOpenCodeTurn("opencode_session_busy", "", 0), true);
  assert.equal(shouldRetryBusyOpenCodeTurn("opencode_session_busy", "Déjà commencé.", 0), false);
  assert.equal(shouldRetryBusyOpenCodeTurn("opencode_session_busy", "", 1), false);
  assert.equal(shouldRetryBusyOpenCodeTurn("opencode_request_failed", "", 0), false);
});

test("le résumé vocal récupéré retire les identifiants et reste borné", () => {
  const speech = speechFromRecoveredOpenCodeAnswer(
    `${"La situation est maîtrisée et les décisions sont documentées. ".repeat(20)}[FIN-SNAPSHOT-20260715]`,
  );
  assert.ok(speech.length <= 900);
  assert.doesNotMatch(speech, /FIN-SNAPSHOT/);
});
