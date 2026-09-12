import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { rtkRewrite } from "../extensions/rtk.ts";

const haveRtk = (() => {
	try {
		execFileSync("rtk", ["--version"], { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
})();

test("rewrites a command rtk knows about", { skip: !haveRtk }, () => {
	assert.equal(rtkRewrite("git status"), "rtk git status");
});

test("leaves a command rtk has no rewrite for", { skip: !haveRtk }, () => {
	assert.equal(rtkRewrite("echo hello"), undefined);
});

test("agrees with rtk's own dry run", { skip: !haveRtk }, () => {
	const dryRun = execFileSync("rtk", ["hook", "check", "ls -la src"], {
		encoding: "utf-8",
	}).trim();
	assert.equal(rtkRewrite("ls -la src"), dryRun);
});

test("returns undefined when rtk is not on PATH", () => {
	const path = process.env.PATH;
	process.env.PATH = "/nonexistent";
	try {
		assert.equal(rtkRewrite("git status"), undefined);
	} finally {
		process.env.PATH = path;
	}
});
