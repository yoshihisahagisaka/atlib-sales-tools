import { test, expect } from "@playwright/test";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { AddressInfo } from "node:net";
import express from "express";
import cookieParser from "cookie-parser";
import { PGlite } from "@electric-sql/pglite";
import { BusinessWebConsultationLeadRepo } from "../src/services/businessWebConsultationLeadRepo";
import { createBusinessWebConsultationLeadRouter } from "../src/routes/businessWebConsultationLead";
import { createAdminBusinessWebConsultationLeadRouter } from "../src/routes/adminBusinessWebConsultationLead";
import { StaffAuthService } from "../src/services/staffAuthService";
import { requireStaffAuth } from "../src/middleware/staffAuth";
import { diagnosisSnapshotSchema } from "../src/domain/businessWebConsultation";
import { randomUUID } from "node:crypto";
let server: http.Server, url: string;
async function answerSelfCheck(page: any, choices: number[][]) {
    await page.goto(url);
    await page.click("#start");
    for (const choice of choices) {
        const options = page.locator(".option");
        for (const index of choice) await options.nth(index).click();
        await page.click("#next");
    }
}
async function createBusinessWebHarness() {
    const db = new PGlite();
    await db.waitReady;
    await db.exec(fs.readFileSync(path.resolve(__dirname, "../migrations/025_business_web_consultation_leads.sql"), "utf8"));
    const repo = new BusinessWebConsultationLeadRepo({ query: (query: string, parameters?: unknown[]) => db.query(query, parameters) } as any);
    const auth = new StaffAuthService("disposable-test-key-not-a-production-secret");
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use("/api/business-web-consultation-leads", createBusinessWebConsultationLeadRouter(repo, { sendBusinessWebConsultationNotification: async () => {}, sendBusinessWebConsultationThanks: async () => {} } as any, { portalBaseUrl: "http://local", diagnosticNotifyEmail: "x", slack: {} } as any, async () => {}));
    app.use("/api/admin/business-web-consultation-leads", requireStaffAuth(auth), createAdminBusinessWebConsultationLeadRouter(repo));
    app.use("/admin", requireStaffAuth(auth), express.static("C:/atlib/atlib-sales-tools/public/admin"));
    const localServer = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => localServer.once("listening", resolve));
    return {
        api: `http://127.0.0.1:${(localServer.address() as AddressInfo).port}`,
        cookie: `staff_session=${auth.issueSessionToken({ email: "operator@atlib.jp" })}`,
        close: async () => { await new Promise<void>(resolve => localServer.close(() => resolve())); await db.close(); },
    };
}
async function forwardLeadToHarness(route: any, api: string) {
    const payload = route.request().postDataJSON();
    const validation = diagnosisSnapshotSchema.safeParse(payload.snapshot);
    if (!validation.success) throw new Error(JSON.stringify(validation.error.issues));
    const response = await fetch(`${api}/api/business-web-consultation-leads`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://www.atlib.jp" }, body: route.request().postData() });
    const body = await response.text();
    if (!response.ok) throw new Error(`Local lead API ${response.status}: ${body}`);
    await route.fulfill({ status: response.status, contentType: "application/json", body });
}
test.beforeAll(async () => {
    const root = "C:/atlib/atlib-corporate-site-deploy/public/business-web/self-check";
    server = http.createServer((req, res) => {
        const file = req.url === "/" ? "index.html" : req.url?.replace(/^\//, "") || "index.html";
        const target = path.join(root, file);
        if (!fs.existsSync(target)) {
            res.statusCode = 404;
            res.end();
            return;
        }
        res.setHeader("Content-Type", target.endsWith(".js") ? "application/javascript" : target.endsWith(".css") ? "text/css" : "text/html");
        res.end(fs.readFileSync(target));
    });
    await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
});
test.afterAll(async () => {
    await new Promise<void>(r => server.close(() => r()));
});
test("local Business Web Self Check loads without page errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    const response = await page.goto(url);
    expect(response?.status()).toBe(200);
    await expect(page.getByText("\u3042\u306A\u305F\u306E\u4ED5\u4E8B\u306E\u300C\u3053\u308C\u304B\u3089\u300D\u3092\u6574\u7406\u3057\u3066\u307F\u307E\u305B\u3093\u304B\uFF1F")).toBeVisible();
    await expect(page.locator("script[src=\"self-check.js\"]")).toHaveCount(1);
    expect(errors).toEqual([]);
});
test("Production Lead API POST is intercepted and fulfilled locally", async ({ page }) => {
    let captured: any;
    await page.route("https://sales.atlib.jp/api/business-web-consultation-leads", async (route) => {
        captured = {
            method: route.request().method(),
            url: route.request().url(),
            body: route.request().postDataJSON()
        };
        await route.fulfill({
            status: 201,
            contentType: "application/json",
            body: JSON.stringify({
                leadId: "test-lead-001"
            })
        });
    });
    await page.goto(url);
    await page.click("#start");
    for (let i = 0; i < 15; i++) {
        const options = page.locator(".option");
        if (i === 1) {
            await options.nth(0).click();
            await options.nth(1).click();
            await options.nth(2).click();
        }
        else
            await options.nth(0).click();
        await page.click("#next");
    }
    await page.click("#consult");
    await page.locator("input[name=\"companyName\"]").fill("Intercept\u682A\u5F0F\u4F1A\u793E");
    await page.locator("input[name=\"personName\"]").fill("Intercept\u592A\u90CE");
    await page.locator("input[name=\"email\"]").fill("intercept@example.test");
    await page.locator("input[name=\"privacyConsent\"]").check();
    await page.locator("input[name=\"diagnosisTransferConsent\"]").check();
    await page.locator("#form button").click();
    await expect(page.getByText("\u53D7\u4ED8\u756A\u53F7: test-lead-001")).toBeVisible();
    await expect(page.locator("#timerex-link")).toBeVisible();
    expect(captured.method).toBe("POST");
    expect(captured.url).toBe("https://sales.atlib.jp/api/business-web-consultation-leads");
    expect(captured.body.companyName).toBe("Intercept\u682A\u5F0F\u4F1A\u793E");
    expect(captured.body.personName).toBe("Intercept\u592A\u90CE");
    expect(captured.body.email).toBe("intercept@example.test");
    expect(captured.body.privacyConsent).toBe(true);
    expect(captured.body.diagnosisTransferConsent).toBe(true);
    expect(captured.body.snapshot).toBeTruthy();
});
test("local Express route persists a T10-shaped lead in PGlite", async ({ request }) => {
    const db = new PGlite();
    await db.waitReady;
    await db.exec(fs.readFileSync(path.resolve(__dirname, "../migrations/025_business_web_consultation_leads.sql"), "utf8"));
    const repo = new BusinessWebConsultationLeadRepo({
        query: (q: string, p?: unknown[]) => db.query(q, p)
    } as any), app = express();
    app.use(express.json());
    app.use("/api/business-web-consultation-leads", createBusinessWebConsultationLeadRouter(repo, {
        sendBusinessWebConsultationNotification: async () => {
        },
        sendBusinessWebConsultationThanks: async () => {
        }
    } as any, {
        portalBaseUrl: "http://local",
        diagnosticNotifyEmail: "x",
        slack: {}
    } as any, async () => {
    }));
    const s = app.listen(0, "127.0.0.1");
    await new Promise<void>(r => s.once("listening", r));
    try {
        const api = `http://127.0.0.1:${(s.address() as AddressInfo).port}`, snapshot = {
            diagnosisDefinition: "business_web_self_check",
            diagnosisVersion: "1.0",
            logicVersion: "1.0",
            originalAnswers: {
                Q01: "EXECUTIVE",
                Q02: ["SHARED_INFORMATION"],
                Q03: "OPEN",
                Q04: 3,
                Q05: 3,
                Q06: 3,
                Q07: 3,
                Q08: 3,
                Q09: 3,
                Q10: 3,
                Q11: 3,
                Q12: ["EXCEL"],
                Q13: 1,
                Q14: 2,
                Q15: "UNKNOWN"
            },
            targetState: {
                clarity: "CLEAR",
                selected: ["SHARED_INFORMATION"]
            },
            sixAxisGaps: {
                workflow: {
                    level: "LARGE",
                    coverage: "HIGH",
                    knownCount: 4,
                    eligibleCount: 4,
                    average: 3
                },
                information: {
                    level: "LARGE",
                    coverage: "HIGH",
                    knownCount: 3,
                    eligibleCount: 3,
                    average: 3
                },
                decision: {
                    level: "LARGE",
                    coverage: "HIGH",
                    knownCount: 2,
                    eligibleCount: 2,
                    average: 3
                },
                dependency: {
                    level: "LARGE",
                    coverage: "HIGH",
                    knownCount: 2,
                    eligibleCount: 2,
                    average: 3
                },
                scalability: {
                    level: "LARGE",
                    coverage: "HIGH",
                    knownCount: 1,
                    eligibleCount: 1,
                    average: 3
                },
                toolConstraint: {
                    level: "SOME",
                    coverage: "HIGH",
                    knownCount: 2,
                    eligibleCount: 2,
                    average: 1.5
                }
            },
            confirmedFacts: ["FACT"],
            unknownItems: ["UNKNOWN"],
            bottlenecks: ["B01"],
            direction: null,
            directionStatus: "SCOPE_CLARIFICATION",
            confidence: "LOW",
            renderedImprovementDirection: "x"
        }, res = await request.post(api + "/api/business-web-consultation-leads", {
            data: {
                companyName: "Local",
                personName: "T10",
                email: "t10@test.local",
                privacyConsent: true,
                diagnosisTransferConsent: true,
                consentWordingVersion: "business_web_consultation_consent_v1",
                idempotencyKey: randomUUID(),
                snapshot
            }
        });
        expect(res.status()).toBe(201);
        const body = await res.json();
        expect(body.leadId).toBeTruthy();
        const row: any = (await db.query("SELECT diagnosis_snapshot FROM business_web_consultation_leads WHERE id=$1", [body.leadId])).rows[0];
        expect(row.diagnosis_snapshot.originalAnswers.Q15).toBe("UNKNOWN");
        expect(row.diagnosis_snapshot.direction).toBeNull();
        expect(row.diagnosis_snapshot.directionStatus).toBe("SCOPE_CLARIFICATION");
        expect(row.diagnosis_snapshot.confidence).toBe("LOW");
    }
    finally {
        await new Promise<void>(r => s.close(() => r()));
        await db.close();
    }
});

test("local Staff Authentication Harness protects and updates Business Web leads", async ({ context, page, request }) => {
    const db = new PGlite();
    await db.waitReady;
    await db.exec(fs.readFileSync(path.resolve(__dirname, "../migrations/025_business_web_consultation_leads.sql"), "utf8"));
    const repo = new BusinessWebConsultationLeadRepo({ query: (query: string, parameters?: unknown[]) => db.query(query, parameters) } as any);
    const auth = new StaffAuthService("disposable-test-key-not-a-production-secret");
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use("/api/business-web-consultation-leads", createBusinessWebConsultationLeadRouter(repo, {
        sendBusinessWebConsultationNotification: async () => {},
        sendBusinessWebConsultationThanks: async () => {},
    } as any, { portalBaseUrl: "http://local", diagnosticNotifyEmail: "x", slack: {} } as any, async () => {}));
    app.use("/api/admin/business-web-consultation-leads", requireStaffAuth(auth), createAdminBusinessWebConsultationLeadRouter(repo));
    const localServer = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => localServer.once("listening", resolve));
    try {
        const api = `http://127.0.0.1:${(localServer.address() as AddressInfo).port}`;
        expect((await request.get(`${api}/api/admin/business-web-consultation-leads`)).status()).toBe(401);

        const created = await request.post(`${api}/api/business-web-consultation-leads`, {
            data: {
                companyName: "Staff Harness株式会社",
                personName: "担当者",
                email: "staff-harness@example.test",
                privacyConsent: true,
                diagnosisTransferConsent: true,
                consentWordingVersion: "business_web_consultation_consent_v1",
                idempotencyKey: randomUUID(),
                snapshot: {
                    diagnosisDefinition: "business_web_self_check", diagnosisVersion: "1.0", logicVersion: "1.0",
                    originalAnswers: { Q01: "EXECUTIVE", Q02: ["SHARED_INFORMATION"], Q03: "OPEN", Q04: 3, Q05: 3, Q06: 3, Q07: 3, Q08: 3, Q09: 3, Q10: 3, Q11: 3, Q12: ["EXCEL"], Q13: 1, Q14: 2, Q15: "UNKNOWN" },
                    targetState: { clarity: "CLEAR", selected: ["SHARED_INFORMATION"] },
                    sixAxisGaps: { workflow: { level: "LARGE", coverage: "HIGH", knownCount: 4, eligibleCount: 4, average: 3 }, information: { level: "LARGE", coverage: "HIGH", knownCount: 3, eligibleCount: 3, average: 3 }, decision: { level: "LARGE", coverage: "HIGH", knownCount: 2, eligibleCount: 2, average: 3 }, dependency: { level: "LARGE", coverage: "HIGH", knownCount: 2, eligibleCount: 2, average: 3 }, scalability: { level: "LARGE", coverage: "HIGH", knownCount: 1, eligibleCount: 1, average: 3 }, toolConstraint: { level: "SOME", coverage: "HIGH", knownCount: 2, eligibleCount: 2, average: 1.5 } },
                    confirmedFacts: ["FACT"], unknownItems: ["UNKNOWN"], bottlenecks: ["B01"], direction: null, directionStatus: "SCOPE_CLARIFICATION", confidence: "LOW", renderedImprovementDirection: "x",
                },
            },
        });
        expect(created.status()).toBe(201);
        const { leadId } = await created.json();

        await context.addCookies([{ name: "staff_session", value: auth.issueSessionToken({ email: "operator@atlib.jp" }), url: api, httpOnly: true, sameSite: "Lax" }]);
        expect((await page.goto(`${api}/api/admin/business-web-consultation-leads`))?.status()).toBe(200);
        expect(await page.locator("body").textContent()).toContain(leadId);
        expect((await page.goto(`${api}/api/admin/business-web-consultation-leads/${leadId}`))?.status()).toBe(200);
        expect(JSON.parse((await page.locator("body").textContent())!).id).toBe(leadId);
        expect(await page.evaluate(async id => (await fetch(`/api/admin/business-web-consultation-leads/${id}/status`, {
            method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "contacted" }),
        })).status, leadId)).toBe(204);
        expect((await page.goto(`${api}/api/admin/business-web-consultation-leads/${leadId}`))?.status()).toBe(200);
        expect(JSON.parse((await page.locator("body").textContent())!).status).toBe("contacted");
    }
    finally {
        await new Promise<void>(resolve => localServer.close(() => resolve()));
        await db.close();
    }
});

test("diagnosis remains browser-only until a failed submission is retried successfully", async ({ page }) => {
    const requests: any[] = [];
    await page.route("https://sales.atlib.jp/api/business-web-consultation-leads", async route => {
        requests.push(route.request().postDataJSON());
        if (requests.length === 1) {
            await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "temporary" }) });
            return;
        }
        await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ leadId: "retry-lead-001" }) });
    });

    await page.goto(url);
    await page.click("#start");
    for (let index = 0; index < 15; index++) {
        const options = page.locator(".option");
        if (index === 1) {
            await options.nth(0).click();
            await options.nth(1).click();
            await options.nth(2).click();
        }
        else {
            await options.nth(0).click();
        }
        await page.click("#next");
    }
    await expect(page.locator(".result")).toBeVisible();
    expect(requests).toHaveLength(0);
    expect(await page.evaluate(() => Object.entries(localStorage))).toEqual([]);

    await page.click("#consult");
    await expect(page.locator("#form")).toBeVisible();
    expect(requests).toHaveLength(0);
    expect(await page.evaluate(() => Object.entries(localStorage))).toEqual([]);

    await page.locator('input[name="companyName"]').fill("Retry株式会社");
    await page.locator('input[name="personName"]').fill("Retry太郎");
    await page.locator('input[name="email"]').fill("retry@example.test");
    await page.locator('input[name="phone"]').fill("03-1234-5678");
    await page.locator('textarea[name="consultationNote"]').fill("再送時にも残る相談内容");
    await page.locator('input[name="privacyConsent"]').check();
    await page.locator('input[name="diagnosisTransferConsent"]').check();
    await page.locator("#form button").click();

    await expect(page.locator("#error")).toBeVisible();
    await expect(page.locator("#error")).toHaveText("送信に失敗しました。時間をおいて再度お試しください。");
    expect(requests).toHaveLength(1);
    await expect(page.locator('input[name="companyName"]')).toHaveValue("Retry株式会社");
    await expect(page.locator('input[name="personName"]')).toHaveValue("Retry太郎");
    await expect(page.locator('input[name="email"]')).toHaveValue("retry@example.test");
    await expect(page.locator('input[name="phone"]')).toHaveValue("03-1234-5678");
    await expect(page.locator('textarea[name="consultationNote"]')).toHaveValue("再送時にも残る相談内容");
    await expect(page.locator('input[name="privacyConsent"]')).toBeChecked();
    await expect(page.locator('input[name="diagnosisTransferConsent"]')).toBeChecked();
    await expect(page.getByText("受付番号:")).toHaveCount(0);
    await expect(page.locator("#timerex-link")).toHaveCount(0);
    expect(await page.evaluate(() => Object.entries(localStorage))).toEqual([]);

    await page.locator("#form button").click();
    await expect(page.getByText("受付番号: retry-lead-001")).toBeVisible();
    await expect(page.locator("#timerex-link")).toBeVisible();
    expect(await page.locator("#timerex-link").getAttribute("href")).toContain("lead_id=retry-lead-001");
    expect(requests).toHaveLength(2);
    expect(requests[0].idempotencyKey).toBe(requests[1].idempotencyKey);
    expect(await page.evaluate(() => Object.entries(localStorage))).toEqual([]);
    await page.waitForTimeout(100);
    expect(requests).toHaveLength(2);
});

test("T05 preserves BC semantics from the actual Self Check UI through local lead preparation", async ({ page, request }) => {
    const harness = await createBusinessWebHarness();
    try {
        await page.route("https://sales.atlib.jp/api/business-web-consultation-leads", route => forwardLeadToHarness(route, harness.api));
        await answerSelfCheck(page, [[1], [7, 4, 6], [1], [2], [2], [2], [3], [1], [2], [2], [1], [2], [3], [3], [2]]);
        await expect(page.locator(".result")).toBeVisible();
        await expect(page.getByText("部分的なシステム化と、業務設計からの見直しの両方を検討できる可能性があります")).toBeVisible();
        await expect(page.locator(".gaps .gap")).toHaveCount(6);
        await expect(page.locator(".bottlenecks")).toBeVisible();
        await expect(page.locator(".facts")).toBeVisible();
        await page.click("#consult");
        await page.locator('input[name="companyName"]').fill("T05株式会社");
        await page.locator('input[name="personName"]').fill("T05担当");
        await page.locator('input[name="email"]').fill("t05@example.test");
        await page.locator('input[name="privacyConsent"]').check();
        await page.locator('input[name="diagnosisTransferConsent"]').check();
        await page.locator("#form button").click();
        await expect(page.getByText(/受付番号:/)).toBeVisible();
        await expect(page.locator("#timerex-link")).toBeVisible();
        const id = (await page.getByText(/受付番号:/).textContent())!.replace("受付番号:", "").trim();
        const detail: any = await (await request.get(`${harness.api}/api/admin/business-web-consultation-leads/${id}`, { headers: { Cookie: harness.cookie } })).json();
        expect(detail.snapshot.direction).toBe("BC");
        expect(detail.snapshot.directionStatus).toBe("DETERMINED");
        expect(detail.snapshot.sixAxisGaps).toMatchObject({ workflow: { level: "LARGE" }, information: { level: "MODERATE" }, decision: { level: "MODERATE" }, dependency: { level: "MODERATE" }, scalability: { level: "SOME" }, toolConstraint: { level: "LARGE" } });
        expect(detail.snapshot.bottlenecks).toEqual(expect.arrayContaining(["B01", "B02", "B04"]));
        expect(detail.snapshot.confirmedFacts.join(" ")).toMatch(/人による確認・連絡・受渡し|現在のツール|ツールに合わせ|入力・転記/);
        expect(detail.preparation.direction).toBe("BC");
        expect(detail.preparation.skipQuestions).toEqual(detail.snapshot.confirmedFacts.map((fact: string) => `確認済み: ${fact}`));
        expect(detail.preparation.standardQuestions.join(" ")).not.toContain("BC");
    } finally { await harness.close(); }
});

test("T10 preserves UNKNOWN scope semantics from the actual Self Check UI through local lead preparation", async ({ page, request }) => {
    const harness = await createBusinessWebHarness();
    try {
        await page.route("https://sales.atlib.jp/api/business-web-consultation-leads", route => forwardLeadToHarness(route, harness.api));
        await answerSelfCheck(page, [[0], [6, 3, 5], [0], [3], [3], [3], [3], [3], [3], [3], [3], [0], [1], [2], [5]]);
        await expect(page.locator(".result")).toBeVisible();
        await expect(page.getByRole("heading", { name: "改善余地は確認されています。改善する範囲を判断するために、もう少し確認したいことがあります" })).toBeVisible();
        await expect(page.locator(".gaps .gap")).toHaveCount(6);
        await expect(page.locator(".unknowns")).toBeVisible();
        await page.click("#consult");
        await page.locator('input[name="companyName"]').fill("T10株式会社");
        await page.locator('input[name="personName"]').fill("T10担当");
        await page.locator('input[name="email"]').fill("t10@example.test");
        await page.locator('input[name="privacyConsent"]').check();
        await page.locator('input[name="diagnosisTransferConsent"]').check();
        await page.locator("#form button").click();
        await expect(page.locator("#timerex-link")).toBeVisible();
        const id = (await page.getByText(/受付番号:/).textContent())!.replace("受付番号:", "").trim();
        const detail: any = await (await request.get(`${harness.api}/api/admin/business-web-consultation-leads/${id}`, { headers: { Cookie: harness.cookie } })).json();
        expect(detail.snapshot.originalAnswers.Q15).toBe("UNKNOWN");
        expect(detail.snapshot.direction).toBeNull();
        expect(detail.snapshot.directionStatus).toBe("SCOPE_CLARIFICATION");
        expect(detail.snapshot.confidence).toBe("LOW");
        expect(detail.snapshot.sixAxisGaps).toMatchObject({ workflow: { level: "LARGE" }, information: { level: "LARGE" }, decision: { level: "LARGE" }, dependency: { level: "LARGE" }, scalability: { level: "LARGE" }, toolConstraint: { level: "MODERATE" } });
        const scope = detail.preparation.standardQuestions.find((question: any) => question.key === "scope_unknown");
        expect(scope.question).toMatch(/この業務の中だけ|前後の業務や他の部門/);
        expect(scope.question).not.toMatch(/全社的|システム化が必要/);
        expect(detail.preparation.direction).toBeNull();
        expect(detail.preparation.directionStatus).toBe("SCOPE_CLARIFICATION");
    } finally { await harness.close(); }
});

test("Production Admin Management UI lists, details, and updates a local Business Web lead", async ({ context, page }) => {
    const harness = await createBusinessWebHarness();
    try {
        await page.route("https://sales.atlib.jp/api/business-web-consultation-leads", route => forwardLeadToHarness(route, harness.api));
        await answerSelfCheck(page, [[0], [6, 3, 5], [0], [3], [3], [3], [3], [3], [3], [3], [3], [0], [1], [2], [5]]);
        await page.click("#consult");
        await page.locator('input[name="companyName"]').fill("Admin UI株式会社");
        await page.locator('input[name="personName"]').fill("管理画面担当");
        await page.locator('input[name="email"]').fill("admin-ui@example.test");
        await page.locator('input[name="privacyConsent"]').check();
        await page.locator('input[name="diagnosisTransferConsent"]').check();
        await page.locator("#form button").click();
        await expect(page.getByText(/受付番号:/)).toBeVisible();
        const id = (await page.getByText(/受付番号:/).textContent())!.replace("受付番号:", "").trim();

        await page.goto(`${harness.api}/admin/business-web-consultation-leads.html`);
        await expect(page).toHaveURL(/\/auth\/login\?returnTo=/);
        await context.addCookies([{ name: "staff_session", value: harness.cookie.slice("staff_session=".length), url: harness.api, httpOnly: true, sameSite: "Lax" }]);
        await page.goto(`${harness.api}/admin/business-web-consultation-leads.html`);
        await expect(page.locator("#table")).toBeVisible();
        const row = page.locator("#table tbody tr").filter({ hasText: "Admin UI株式会社" });
        await expect(row).toContainText("管理画面担当");
        await expect(row).toContainText("新規");
        await expect(row).toContainText("- / SCOPE_CLARIFICATION");
        await expect(row.locator("a")).toHaveText("詳細");
        await row.locator("a").click();
        await expect(page).toHaveURL(new RegExp(`id=${id}`));
        for (const section of ["1. Lead Information", "2. 目指している状態", "3. 今回確認できたFACT", "4. UNKNOWN", "5. 改善余地", "6. 改善を進めるうえで注目したいこと", "7. セルフチェックで示した改善の方向性", "8. Consultation Preparation", "9. Tracking / Consent", "10. Status / Scheduling"]) await expect(page.getByRole("heading", { name: section })).toBeVisible();
        for (const label of ["最初に確認すること", "標準質問", "深掘り候補", "すでに確認済み", "相談の進め方"]) await expect(page.getByRole("heading", { name: label })).toBeVisible();
        await expect(page.locator("#content")).toContainText("SCOPE_CLARIFICATION");
        await expect(page.locator("#content")).toContainText("confidence LOW");
        await page.locator("#status").selectOption("contacted");
        await page.locator("#save").click();
        await expect(page.locator("#saved")).toHaveText("保存しました。");
        await page.reload();
        await expect(page.locator("#status")).toHaveValue("contacted");
    } finally { await harness.close(); }
});
