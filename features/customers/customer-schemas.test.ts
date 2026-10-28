import { describe, expect, it } from "vitest";
import { customerIdSchema, customerSearchSchema, customerProfileSchema, customerDuplicateSchema } from "./customer-schemas";
describe("customer boundary schemas", () => {
  it.each([null, undefined, 12, {}, [], "", " ", "a".repeat(192)])("rejects malformed customer IDs %j", input => {
    expect(customerIdSchema.safeParse(input).success).toBe(false);
  });
  it("trims bounded IDs and searches", () => {
    expect(customerIdSchema.parse(" cus_1 ")).toBe("cus_1");
    expect(customerSearchSchema.parse(" Jane ")).toBe("Jane");
    expect(customerSearchSchema.parse(" ")).toBe("");
  });
  it.each([null, {}, 1, [], "a".repeat(201)])("rejects malformed searches %j", input => {
    expect(customerSearchSchema.safeParse(input).success).toBe(false);
  });
  it.each([null, [], {}, {name:""}, {name:" "}, {name:1}, {name:"a".repeat(201)}, {name:"Jane",email:null}, {name:"Jane",email:"a".repeat(321)}, {name:"Jane",phone:"a".repeat(51)}])("rejects malformed profile %j", input => {
    expect(customerProfileSchema.safeParse(input).success).toBe(false);
  });
  it("strips supplied identity without normalizing raw profile contacts", () => {
    expect(customerProfileSchema.parse({ name:" Jane ", email:"", phone:"09171234567", businessSlug:"foreign", business_id:"foreign", trust_tier:"TRUSTED" })).toEqual({name:" Jane ", email:"", phone:"09171234567"});
  });
  it("preserves omitted versus explicit empty contact patches", () => {
    expect(customerProfileSchema.parse({name:"Jane"})).toEqual({name:"Jane"});
    expect(customerProfileSchema.parse({name:"Jane", email:"", phone:""})).toEqual({name:"Jane", email:"", phone:""});
  });
  it("allows an empty typed name in duplicate confirmation", () => {
    expect(customerDuplicateSchema.parse({name:"",email:"test@example.com"})).toEqual({name:"",email:"test@example.com"});
  });
});

