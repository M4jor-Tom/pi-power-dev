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

test("blocks a newline-separated destroy", () => {
	assert.ok(denyReason("echo hi\nterraform destroy"));
});

test("blocks despite quoting the subcommand", () => {
	assert.ok(denyReason('terraform "destroy"'));
	assert.ok(denyReason("terraform 'destroy'"));
});

test("blocks inside command substitution", () => {
	assert.ok(denyReason("$(terraform destroy)"));
});

test("blocks inside backtick substitution", () => {
	assert.ok(denyReason("`terraform destroy`"));
	assert.ok(denyReason("echo `terraform destroy`"));
});

test("blocks with leading whitespace or doubled spacing", () => {
	assert.ok(denyReason("  terraform destroy"));
	assert.ok(denyReason("terraform  destroy"));
});

test("blocks when reached through xargs", () => {
	assert.ok(denyReason("xargs terraform destroy"));
});

test("does not block terraform destroy-plan", () => {
	assert.equal(denyReason("terraform destroy-plan"), undefined);
});
