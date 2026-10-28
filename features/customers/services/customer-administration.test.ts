import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ business:{findFirst:vi.fn()}, customer:{create:vi.fn(),updateMany:vi.fn(),findFirst:vi.fn(),deleteMany:vi.fn()}, $transaction:vi.fn() }));
vi.mock("@/prisma/prisma", () => ({prisma:db}));
vi.mock("@/lib/auth/guards", () => ({}));
import { createTenantCustomer, updateTenantCustomer, deleteTenantCustomer, CustomerAdministrationError, customerMutationError } from "./customer-administration";
import type { CustomerActorContext } from "@/features/customers/customer-access";
import { customerScalarSelect } from "@/features/customers/customer-select";
const context = {success:true,actorType:"OWNER",role:"OWNER",businessId:"biz_a",businessSlug:"tenant-a",userId:"user_a",ownerId:7} as CustomerActorContext;
const input = {name:"Jane"};
describe("tenant customer persistence", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    db.$transaction.mockImplementation(async callback => callback(db));
    db.business.findFirst.mockResolvedValue({id:"biz_a"});
    db.customer.create.mockResolvedValue({id:"cus_1",name:"Jane"});
    db.customer.updateMany.mockResolvedValue({count:1});
    db.customer.findFirst.mockResolvedValue({id:"cus_1",name:"Jane"});
    db.customer.deleteMany.mockResolvedValue({count:1});
  });
  it("creates under verified tenant with narrow scalar select inside serializable membership transaction", async () => {
    expect(await createTenantCustomer(context,input)).toEqual({id:"cus_1",name:"Jane"});
    expect(db.customer.create).toHaveBeenCalledWith({data:{name:"Jane",email:undefined,phone:undefined,business_id:"biz_a"},select:customerScalarSelect});
    expect(db.business.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({id:"biz_a",owners:{some:{id:7,user_id:"user_a",business_id:"biz_a",user:{role:"OWNER"}}}})}));
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function),{isolationLevel:"Serializable",maxWait:5000,timeout:10000});
  });
  it("denies create when membership was removed after actor resolution", async () => {
    db.business.findFirst.mockResolvedValue(null);
    await expect(createTenantCustomer(context,input)).rejects.toThrow("Forbidden");
    expect(db.customer.create).not.toHaveBeenCalled();
  });
  it.each([{name:"Jane"}, {name:"Jane",email:"",phone:""}, {name:"Jane",email:"test@example.com"}])("preserves contact patch semantics %j and scopes update and reload identically", async patch => {
    expect(await updateTenantCustomer(context,"cus_1",patch)).toEqual({id:"cus_1",name:"Jane"});
    const update = db.customer.updateMany.mock.calls[0][0];
    expect(update.data).toEqual({name:patch.name,email:patch.email,phone:patch.phone});
    expect(update.where).toMatchObject({id:"cus_1",business_id:"biz_a",business:{id:"biz_a",owners:{some:{user_id:"user_a",user:{role:"OWNER"}}}}});
    expect(db.customer.findFirst).toHaveBeenCalledWith({where:update.where,select:customerScalarSelect});
  });
  it("throws from inside transaction for missing reload instead of committing partial update", async () => {
    db.customer.findFirst.mockResolvedValue(null);
    await expect(updateTenantCustomer(context,"cus_1",input)).rejects.toThrow("Failed to load updated customer");
    expect(db.customer.updateMany).toHaveBeenCalledTimes(1);
  });
  it("denies foreign or stale-actor update before reload", async () => {
    db.customer.updateMany.mockResolvedValue({count:0});
    await expect(updateTenantCustomer(context,"foreign",input)).rejects.toThrow("Customer not found or unauthorized");
    expect(db.customer.findFirst).not.toHaveBeenCalled();
  });
  it("deletes only exact tenant/current membership target", async () => {
    await deleteTenantCustomer(context,"cus_1");
    expect(db.customer.deleteMany).toHaveBeenCalledWith({where:expect.objectContaining({id:"cus_1",business_id:"biz_a",business:expect.objectContaining({owners:{some:{id:7,user_id:"user_a",business_id:"biz_a",user:{role:"OWNER"}}}})})});
  });
  it("denies foreign/stale delete", async () => {
    db.customer.deleteMany.mockResolvedValue({count:0});
    await expect(deleteTenantCustomer(context,"foreign")).rejects.toThrow("Customer not found or unauthorized");
  });
  it.each(["create","update","delete"])("propagates %s persistence errors for safe action handling", async operation => {
    const error = new Error("secret SQL");
    if(operation==="create") { db.customer.create.mockRejectedValue(error); await expect(createTenantCustomer(context,input)).rejects.toBe(error); }
    if(operation==="update") { db.customer.updateMany.mockRejectedValue(error); await expect(updateTenantCustomer(context,"cus_1",input)).rejects.toBe(error); }
    if(operation==="delete") { db.customer.deleteMany.mockRejectedValue(error); await expect(deleteTenantCustomer(context,"cus_1")).rejects.toBe(error); }
  });
  it("maps only known domain conflicts, hiding internal errors", () => {
    expect(customerMutationError(new CustomerAdministrationError("Forbidden"),"safe")).toBe("Forbidden");
    expect(customerMutationError({code:"P2034"},"safe")).toBe("Customer changed. Please refresh and try again.");
    expect(customerMutationError(new Error("secret SQL"),"safe")).toBe("safe");
    expect(customerMutationError(null,"safe")).toBe("safe");
  });
  it("selects exactly supported existing scalars, no relations or future expansion", () => {
    expect(Object.keys(customerScalarSelect).sort()).toEqual(["id","name","email","phone","trust_tier","no_show_count","last_no_show_at","business_id","is_demo","created_at","updated_at"].sort());
  });
});

