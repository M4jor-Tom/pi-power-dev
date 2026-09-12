import { test } from "node:test";
import assert from "node:assert/strict";
import { denyReason } from "../extensions/guard.ts";

test("blocks terraform destroy", () => {
	assert.match(String(denyReason("terraform destroy -auto-approve")), /terraform/);
});

test("blocks tofu destroy", () => {
	assert.match(String(denyReason("tofu destroy")), /tofu/);
});

test("blocks it mid-pipeline too", () => {
	assert.ok(denyReason("cd infra && terraform destroy"));
});

test("allows terraform plan and apply", () => {
	assert.equal(denyReason("terraform plan"), undefined);
	assert.equal(denyReason("terraform apply"), undefined);
});

test("does not match a destroy that is not terraform's", () => {
	assert.equal(denyReason("./destroy.sh"), undefined);
	assert.equal(denyReason("echo terraform destroys nothing"), undefined);
});
