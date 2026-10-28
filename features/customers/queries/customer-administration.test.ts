import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({customer:{findMany:vi.fn(),findFirst:vi.fn()},booking:{findMany:vi.fn(),findFirst:vi.fn()},availedService:{findMany:vi.fn()}}));
vi.mock("@/prisma/prisma", () => ({prisma:db}));
vi.mock("@/lib/auth/guards", () => ({}));
import {searchTenantCustomers,findTenantDuplicateCustomer,getTenantCustomerHistory} from "./customer-administration";
import type { CustomerActorContext } from "@/features/customers/customer-access";
const context = {success:true,actorType:"OWNER",role:"OWNER",businessId:"biz_a",businessSlug:"tenant-a",userId:"user_a",ownerId:7} as CustomerActorContext;
const date = new Date("2026-01-01T10:00:00Z");
describe("narrow tenant customer queries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    db.customer.findMany.mockResolvedValue([]);
    db.customer.findFirst.mockResolvedValue({id:"cus_1"});
    db.booking.findMany.mockResolvedValue([]);
    db.booking.findFirst.mockResolvedValue(null);
    db.availedService.findMany.mockResolvedValue([]);
  });
  it.each(["a","Ja","917","91","0917 123 4567","+63 917 123 4567"])("retains search matching rules %s, result bound and tenant nested visits", async query => {
    await searchTenantCustomers(context,query);
    const args=db.customer.findMany.mock.calls[0][0];
    expect(args).toMatchObject({where:{business_id:"biz_a",business:{id:"biz_a"},OR:expect.arrayContaining([{name:{startsWith:query,mode:"insensitive"}}])},take:8,orderBy:{name:"asc"},select:{bookings:{where:{business_id:"biz_a"},take:1}}});
    if(query==="a") expect(args.where.OR).toHaveLength(1);
    if(query==="Ja") expect(args.where.OR).toContainEqual({email:{contains:"Ja",mode:"insensitive"}});
    if(query==="917") expect(args.where.OR).toContainEqual({phone:{contains:"917"}});
    if(query==="91") expect(args.where.OR).toHaveLength(1);
  });
  it("maps scheduled, created and absent visit dates without leaking selected relation", async () => {
    db.customer.findMany.mockResolvedValue([
      {id:"a",name:"A",email:null,phone:null,trust_tier:"NEW",no_show_count:0,bookings:[{scheduled_at:date,created_at:new Date(0)}]},
      {id:"b",name:"B",email:null,phone:null,trust_tier:"NEW",no_show_count:0,bookings:[{scheduled_at:null,created_at:date}]},
      {id:"c",name:"C",email:null,phone:null,trust_tier:"NEW",no_show_count:0,bookings:[]},
    ]);
    const result=await searchTenantCustomers(context,"A");
    expect(result.data?.map(x=>x.lastBookingAt)).toEqual([date,date,null]);
    expect(result.data?.[0]).not.toHaveProperty("bookings");
  });
  it("short-circuits blank search and absent duplicate contacts", async () => {
    expect(await searchTenantCustomers(context," ")).toEqual({success:true,data:[]});
    expect(await findTenantDuplicateCustomer(context,{name:"Jane",email:" ",phone:""})).toEqual({success:true,data:null});
    expect(db.customer.findMany).not.toHaveBeenCalled();
    expect(db.customer.findFirst).not.toHaveBeenCalled();
  });
  it.each(["Jane","Maria","Maria Santos","Maria Santos Jr",""])("preserves duplicate mismatch substring/empty heuristic %s", async name => {
    db.customer.findFirst.mockResolvedValue({id:"cus_1",name:"Maria Santos",email:"maria@example.com",phone:"639171234567"});
    const result=await findTenantDuplicateCustomer(context,{name,email:" MARIA@EXAMPLE.COM ",phone:"09171234567"});
    expect(result).toMatchObject({success:true,data:{matchedOn:"email",nameMismatch:name==="Jane"}});
    expect(db.customer.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({business_id:"biz_a",email:{equals:"maria@example.com",mode:"insensitive"},business:expect.objectContaining({id:"biz_a"})}),select:{id:true,name:true,email:true,phone:true}}));
  });
  it("falls back from email to normalized phone and returns null for no match", async () => {
    db.customer.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({id:"cus_1",name:"Jane",email:null,phone:"639171234567"});
    expect(await findTenantDuplicateCustomer(context,{name:"Jane",email:"none@example.com",phone:"09171234567"})).toMatchObject({success:true,data:{matchedOn:"phone"}});
    expect(db.customer.findFirst.mock.calls[1][0].where.phone).toBe("639171234567");
    db.customer.findFirst.mockResolvedValue(null);
    expect(await findTenantDuplicateCustomer(context,{name:"Jane",phone:"09171234567"})).toEqual({success:true,data:null});
  });
  it("denies foreign customer history before any nested booking work", async () => {
    db.customer.findFirst.mockResolvedValue(null);
    expect(await getTenantCustomerHistory(context,"foreign")).toEqual({success:false,error:"Customer not found"});
    expect(db.booking.findMany).not.toHaveBeenCalled();
  });
  it("preserves booking and nullable-service next appointment DTO", async () => {
    const booking={id:1,status:"PENDING",payment_method:"CASH",scheduled_at:null,estimated_end:null,created_at:date,grand_total:100,total_discount:0,downpayment:null,availed_services:[]};
    db.booking.findMany.mockResolvedValue([booking]);
    db.booking.findFirst.mockResolvedValue({id:2,scheduled_at:date,estimated_end:null,availed_services:[{service:{name:"Cut"}},{service:null},{service:{name:""}}]});
    expect(await getTenantCustomerHistory(context,"cus_1")).toEqual({success:true,data:{bookings:[booking],nextAppointment:{bookingId:2,scheduledAt:date,estimatedEnd:null,services:["Cut"]},flowStatus:[]}});
    expect(db.booking.findMany.mock.calls[0][0].select.availed_services.where).toEqual({service:{business_id:"biz_a"}});
    expect(db.booking.findFirst.mock.calls[0][0]).toMatchObject({where:{business_id:"biz_a",customer_id:"cus_1",business:{id:"biz_a"},status:{not:"CANCELLED"},scheduled_at:{gt:expect.any(Date)}}});
  });
  it.each(["DAYS","WEEKS","MONTHS"])("preserves delay %s, newest-trigger dedup and earliest completion after trigger", async unit => {
    const older=new Date("2025-12-01T10:00:00Z");
    const completed=new Date("2026-01-03T10:00:00Z");
    const flow={trigger_service_id:1,suggested_service_id:2,delay_duration:2,delay_unit:unit,type:"REQUIRED",suggested_service:{name:"Return"}};
    db.availedService.findMany.mockResolvedValue([
      {service_id:1,served_at:date,created_at:date,service:{name:"Cut",flow_triggers:[flow]}},
      {service_id:2,served_at:new Date("2026-01-04T10:00:00Z"),created_at:date,service:{name:"Return",flow_triggers:[]}},
      {service_id:2,served_at:completed,created_at:date,service:{name:"Return",flow_triggers:[]}},
      {service_id:1,served_at:null,created_at:older,service:{name:"Cut",flow_triggers:[flow]}},
    ]);
    const result=await getTenantCustomerHistory(context,"cus_1");
    expect(result.success).toBe(true);
    if(!result.success) throw new Error("expected history");
    const expected=new Date(date);
    if(unit==="DAYS") expected.setDate(expected.getDate()+2);
    if(unit==="WEEKS") expected.setDate(expected.getDate()+14);
    if(unit==="MONTHS") expected.setMonth(expected.getMonth()+2);
    expect(result.data.flowStatus).toEqual([{triggerServiceId:1,triggerServiceName:"Cut",suggestedServiceId:2,suggestedServiceName:"Return",flowType:"REQUIRED",status:"COMPLETED",dueDate:expected,completedAt:completed,lastServiceDate:date,delayDuration:2,delayUnit:unit}]);
    const args=db.availedService.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({service:{business_id:"biz_a"},booking:{customer_id:"cus_1",business_id:"biz_a",business:{id:"biz_a"},status:{not:"CANCELLED"}}});
    expect(args.select.service.select.flow_triggers.where).toEqual({business_id:"biz_a",suggested_service:{business_id:"biz_a"}});
    expect(args).not.toHaveProperty("include");
  });
  it("retains pending flows and created-date fallback", async () => {
    db.availedService.findMany.mockResolvedValue([{service_id:1,served_at:null,created_at:date,service:{name:"Cut",flow_triggers:[{trigger_service_id:1,suggested_service_id:2,delay_duration:0,delay_unit:"DAYS",type:"SUGGESTED",suggested_service:{name:"Return"}}]}}]);
    expect(await getTenantCustomerHistory(context,"cus_1")).toMatchObject({success:true,data:{flowStatus:[{status:"PENDING",completedAt:null,lastServiceDate:date,dueDate:date,flowType:"SUGGESTED"}]}});
  });
  it.each(["search","duplicate","history"])("returns safe %s errors", async operation => {
    const error=new Error("secret SQL");
    if(operation==="search") {db.customer.findMany.mockRejectedValue(error);expect(await searchTenantCustomers(context,"Jane")).toEqual({success:false,error:"Failed to search customers"});}
    if(operation==="duplicate") {db.customer.findFirst.mockRejectedValue(error);expect(await findTenantDuplicateCustomer(context,{name:"Jane",phone:"09171234567"})).toEqual({success:false,error:"Failed to check for duplicates"});}
    if(operation==="history") {db.booking.findMany.mockRejectedValue(error);expect(await getTenantCustomerHistory(context,"cus_1")).toEqual({success:false,error:"Failed to fetch customer history"});}
  });
});

