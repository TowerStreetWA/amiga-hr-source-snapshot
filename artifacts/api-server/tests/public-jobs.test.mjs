import assert from "node:assert/strict";
import test from "node:test";
import { ListPublicJobsResponse } from "../../../lib/api-zod/src/generated/api.ts";
import {
  listPublicJobs,
  PUBLIC_JOBS_UNAVAILABLE_MESSAGE,
} from "../src/lib/publicJobs.ts";

function makeRequest() {
  return {
    log: {
      error() {},
    },
  };
}

function makeResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

const healthyJob = {
  id: 42,
  title: "People Operations Lead",
  department: "People",
  location: "London",
  employmentType: "full_time",
  salaryMin: "50000.00",
  salaryMax: "65000.00",
  currency: "GBP",
  description: "Help build a great employee experience.",
  status: "open",
  closingDate: "2026-12-31",
  createdAt: new Date("2026-09-07T10:00:00.000Z"),
  updatedAt: new Date("2026-09-07T10:00:00.000Z"),
};

const jobWithNullableApplicantFields = {
  ...healthyJob,
  id: 43,
  title: "People Coordinator",
  salaryMin: null,
  salaryMax: null,
  description: null,
  closingDate: null,
};

test("public jobs handler returns a response compatible with applicant clients", async () => {
  const response = makeResponse();

  await listPublicJobs(makeRequest(), response, async () => [
    healthyJob,
    jobWithNullableApplicantFields,
  ]);

  assert.equal(response.statusCode, 200);
  const jobs = ListPublicJobsResponse.parse(response.body);

  assert.deepEqual(jobs, response.body);
  assert.equal(jobs[0].salaryMin, 50000);
  assert.equal(jobs[0].salaryMax, 65000);
  assert.equal(jobs[1].salaryMin, null);
  assert.equal(jobs[1].salaryMax, null);
  assert.equal(jobs[1].closingDate, null);

  for (const job of jobs) {
    assert.equal(new Date(job.createdAt).toISOString(), job.createdAt);
    assert.equal(new Date(job.updatedAt).toISOString(), job.updatedAt);
  }
});

test("public jobs handler returns an empty array when there are no open jobs", async () => {
  const response = makeResponse();

  await listPublicJobs(makeRequest(), response, async () => []);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, []);
});

test("public jobs handler returns a retryable 503 when the database fails", async () => {
  const response = makeResponse();

  await listPublicJobs(makeRequest(), response, async () => {
    throw new Error("database unavailable");
  });

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, {
    error: PUBLIC_JOBS_UNAVAILABLE_MESSAGE,
    retryable: true,
  });
});