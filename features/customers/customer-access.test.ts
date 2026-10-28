import { beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => vi.fn());
const db = vi.hoisted(() => ({ business: { findUnique: vi.fn() }, user: { findUnique: vi.fn() } }));
vi.mock("@/lib/auth/guards", () => ({ requireAuth: auth }));
vi.mock("@/prisma/prisma", () => ({ prisma: db }));
import { requireCustomerAccess, customerBusinessWhere, type CustomerActorContext } from "./customer-access";
import { Role, StaffProfile } from "@/prisma/generated/prisma/enums";
const business = {id:"biz_a",slug:"tenant-a",structure:"OWNER_EMPLOYEE_SELF_SERVICE",allow_employee_self_booking:false,manager_can_serve:false};
describe("current customer access", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    auth.mockResolvedValue({success:true,businessSlug:"tenant-a",session:{user:{id:"user_a",role:"OWNER"}}});
    db.business.findUnique.mockResolvedValue(business);
    db.user.findUnique.mockResolvedValue({id:"user_a",role:Role.OWNER,owner:{id:7,business_id:"biz_a"},employee:null});
  });
  it("resolves the current owner, not stale session permissions", async () => {
    const access = await requireCustomerAccess(true);
    expect(auth).toHaveBeenCalledWith({write:true});
    expect(access).toMatchObject({success:true,context:{actorType:"OWNER",ownerId:7,businessId:"biz_a",userId:"user_a"}});
    if (!access.success) throw new Error("expected access");
    expect(customerBusinessWhere(access.context)).toEqual({id:"biz_a",slug:"tenant-a",owners:{some:{id:7,user_id:"user_a",business_id:"biz_a",user:{role:Role.OWNER}}}});
  });
  it.each(Object.values(StaffProfile))("retains reads/writes for current %s without new operational permissions", async profile => {
    db.user.findUnique.mockResolvedValue({id:"user_a",role:Role.EMPLOYEE,owner:null,employee:{id:9,business_id:"biz_a",profile,permissions:[]}});
    const access = await requireCustomerAccess(true);
    expect(access).toMatchObject({success:true,context:{actorType:"EMPLOYEE",employeeId:9,profile}});
    if (!access.success) throw new Error("expected access");
    expect(customerBusinessWhere(access.context)).toMatchObject({id:"biz_a",employees:{some:{id:9,user_id:"user_a",business_id:"biz_a",user:{role:Role.EMPLOYEE}}}});
  });
  it.each([
    null,
    {id:"user_a",role:Role.PLATFORM_ADMIN,owner:{id:7,business_id:"biz_a"}},
    {id:"user_a",role:Role.OWNER,owner:null,employee:{id:9,business_id:"biz_a"}},
    {id:"user_a",role:Role.OWNER,owner:{id:7,business_id:"foreign"}},
    {id:"user_a",role:Role.EMPLOYEE,employee:{id:9,business_id:"foreign"}},
    {id:"user_a",role:Role.EMPLOYEE,employee:null},
  ])("denies missing, foreign and stale membership %j", async user => {
    db.user.findUnique.mockResolvedValue(user);
    expect((await requireCustomerAccess()).success).toBe(false);
  });
  it("preserves subscription read-only failure and skips actor lookup", async () => {
    auth.mockResolvedValue({success:false,error:"Subscription read-only"});
    expect(await requireCustomerAccess(true)).toEqual({success:false,error:"Subscription read-only"});
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });
  it("denies malformed auth without current-user lookup", async () => {
    auth.mockResolvedValue({success:true,businessSlug:"tenant-a",session:{user:{}}});
    expect(await requireCustomerAccess()).toEqual({success:false,error:"Unauthorized"});
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });
  it("denies missing business", async () => {
    db.business.findUnique.mockResolvedValue(null);
    expect((await requireCustomerAccess()).success).toBe(false);
  });
  it("fail-closes forged runtime context predicates", () => {
    expect(customerBusinessWhere({actorType:"PLATFORM_ADMIN"} as unknown as CustomerActorContext)).toEqual({id:{in:[]}});
  });
});

