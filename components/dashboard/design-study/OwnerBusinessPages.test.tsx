import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ownerPreviewKeys, type OwnerPreviewIdentity } from "@/components/dashboard/owner-preview/owner-preview-query";
import type { OwnerBillingPreviewData } from "@/features/billing/types/owner-billing-preview";

const mocks = vi.hoisted(()=>({fetch:vi.fn(),hours:vi.fn(),invoice:vi.fn(),payment:vi.fn(),upgrade:vi.fn(),success:vi.fn(),error:vi.fn()}));
const identity:OwnerPreviewIdentity={userId:"owner-a",businessId:"business-a",businessSlug:"beautyfeel",businessName:"BeautyFeel",ownerName:"Owner"};
vi.mock("@/components/dashboard/owner-preview/OwnerPreviewQueryProvider",()=>({useOwnerPreviewContext:()=>identity,useOwnerPreviewFetch:()=>mocks.fetch}));
vi.mock("@/features/businesses/actions/business-hours",()=>({updateBusinessHours:mocks.hours}));
vi.mock("@/features/billing/actions/subscription-owner",()=>({createOwnerSubscriptionInvoiceAction:mocks.invoice,submitManualPaymentReferenceAction:mocks.payment,requestOwnerPlanUpgradeAction:mocks.upgrade}));
vi.mock("sonner",()=>({toast:{success:mocks.success,error:mocks.error}}));
vi.mock("@/components/bookings/design-study/AnimatedFilterGroup",()=>({default:({children,label}:{children:ReactNode;label:string})=><div role="group" aria-label={label}>{children}</div>}));
vi.mock("recharts",()=>({ResponsiveContainer:({children}:{children:ReactNode})=><div>{children}</div>,AreaChart:({children}:{children:ReactNode})=><div>{children}</div>,ComposedChart:({children}:{children:ReactNode})=><div>{children}</div>,Area:()=>null,Bar:()=>null,CartesianGrid:()=>null,Tooltip:()=>null,XAxis:()=>null,YAxis:()=>null}));
import { OwnerBusinessHoursPreview } from "@/components/dashboard/owner-preview/OwnerBusinessHoursPreview";
import { OwnerBusinessHoursPreviewQuery } from "@/components/dashboard/owner-preview/OwnerBusinessHoursPreviewQuery";
import { OwnerBillingPreviewQuery } from "@/components/dashboard/owner-preview/OwnerBillingPreviewQuery";
import { OwnerReportsPreview } from "@/components/dashboard/owner-preview/OwnerReportsPreview";

const hours={businessName:"BeautyFeel",serviceCategories:["Skin","Hair"],hours:[{day_of_week:1,category:"Skin",open_time:"09:00",close_time:"17:00",is_closed:false}]};
const billing:OwnerBillingPreviewData={businessName:"BeautyFeel",subscription:{planName:"Plus",planCode:"PLUS",status:"ACTIVE",periodEnd:"2026-11-01T00:00:00Z",entitlements:{website:true,growth:true,social:false,ai:false,reportsCore:true,reportsAdvanced:false}},availableUpgradePlanNames:["Pro"],availableUpgradePlans:[{code:"PRO",name:"Pro",priceAmount:249900}],pendingUpgradeRequest:null,referral:null,invoices:[{id:"invoice-a",createdAt:"2026-10-01T00:00:00Z",periodStart:"2026-10-01T00:00:00Z",periodEnd:"2026-11-01T00:00:00Z",dueAt:"2026-10-15T00:00:00Z",status:"OPEN",amountSubtotal:249900,amountCreditApplied:50000,amountDue:199900,amountPaid:0,paidAt:null,paymentReference:null,paymentSubmittedAt:null}],upgradeRequests:[]};
const overview={tab:"overview",range:{preset:"30d",label:"Last 30 days"},data:{kpis:{collectedRevenue:800,totalBookings:4,bookedRevenue:1000,outstandingBalance:200,totalExpenses:100,trueNetProfit:500,completionRate:75},trend:[],topServices:[],bookingVolume:{accepted:4}}};
function client(){return new QueryClient({defaultOptions:{queries:{retry:false}}});}
function mount(node:ReactNode,c:QueryClient){return render(<QueryClientProvider client={c}>{node}</QueryClientProvider>);}
function mountBilling(data=billing){const c=client();c.setQueryData(ownerPreviewKeys.section(identity,"billing","page"),data);mount(<OwnerBillingPreviewQuery redesign/>,c);return c;}
function mountReports(){const c=client();c.setQueryData(ownerPreviewKeys.section(identity,"reports","page",{tab:"overview",range:"30d",groupBy:"day"}),overview);mount(<OwnerReportsPreview redesign/>,c);return c;}
beforeEach(()=>{vi.clearAllMocks();});

describe("redesigned business hours",()=>{
  const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype,"scrollIntoView");
  beforeAll(()=>Object.defineProperty(HTMLElement.prototype,"scrollIntoView",{configurable:true,value:vi.fn()}));
  afterAll(()=>{if(originalScrollIntoView) Object.defineProperty(HTMLElement.prototype,"scrollIntoView",originalScrollIntoView);else Reflect.deleteProperty(HTMLElement.prototype,"scrollIntoView");});
  const shared={...hours,serviceCategories:["GENERAL","Hair","Skin"],hours:Array.from({length:7},(_,day)=>({...hours.hours[0],day_of_week:day,category:"GENERAL"}))};
  function mountHours(data=shared,onSaved=vi.fn().mockResolvedValue(true)){
    render(<OwnerBusinessHoursPreview redesign businessSlug="beautyfeel" data={data} refreshControl={null} onSaved={onSaved}/>);
  }
  async function changeWeek(value="10:00"){
    fireEvent.click(screen.getByRole("button",{name:"Edit hours"}));
    fireEvent.change(screen.getByLabelText("Opens at"),{target:{value}});
    fireEvent.click(screen.getByRole("button",{name:"Use these hours"}));
    await waitFor(()=>expect(screen.queryByTestId("catalog-editor-overlay")).not.toBeInTheDocument());
  }
  it("starts with one schedule, without category tabs or seven duplicate rows",()=>{
    mountHours();
    expect(screen.getByText("All your services follow this schedule. You’re set.")).toBeInTheDocument();
    expect(screen.getByText("Every day")).toBeInTheDocument();
    expect(screen.queryByRole("button",{name:"Hair"})).not.toBeInTheDocument();
    expect(screen.queryByRole("button",{name:"Save changes"})).not.toBeInTheDocument();
  });
  it("updates multiple days in a draft, saves only changed rows, and retains failed edits",async()=>{
    mocks.hours.mockResolvedValue({success:false,error:"Could not save"});
    mountHours();
    await changeWeek();
    expect(screen.getByText("Changes ready to save")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Save changes"}));
    await waitFor(()=>expect(mocks.error).toHaveBeenCalledWith("Could not save"));
    expect(mocks.hours).toHaveBeenCalledWith("beautyfeel",expect.arrayContaining([{...shared.hours[0],open_time:"10:00"}]),{expectedHours:shared.hours,resetCategories:[]});
    expect(mocks.hours.mock.calls[0][1]).toHaveLength(7);
    fireEvent.click(screen.getByRole("button",{name:"Discard changes"}));
    expect(screen.queryByText("Changes ready to save")).not.toBeInTheDocument();
  });
  it("allows weekday hours without changing the weekend",async()=>{
    mountHours();
    fireEvent.click(screen.getByRole("button",{name:"Edit hours"}));
    fireEvent.click(screen.getByRole("button",{name:"Mon–Fri"}));
    fireEvent.change(screen.getByLabelText("Opens at"),{target:{value:"10:00"}});
    fireEvent.click(screen.getByRole("button",{name:"Use these hours"}));
    await waitFor(()=>expect(screen.queryByTestId("catalog-editor-overlay")).not.toBeInTheDocument());
    expect(screen.getByText("Mon – Fri")).toBeInTheDocument();
    expect(screen.getByText("Sat & Sun")).toBeInTheDocument();
  });
  it("shows Open 24 hours and persists the existing midnight encoding",async()=>{
    mocks.hours.mockResolvedValue({success:true});
    mountHours();
    fireEvent.click(screen.getByRole("button",{name:"Edit hours"}));
    fireEvent.keyDown(screen.getByRole("combobox",{name:"Opening hours"}),{key:"ArrowDown"});
    fireEvent.click(await screen.findByRole("option",{name:"Open 24 hours"}));
    expect(screen.queryByLabelText("Opens at")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Use these hours"}));
    await waitFor(()=>expect(screen.queryByTestId("catalog-editor-overlay")).not.toBeInTheDocument());
    expect(screen.getByText("Open 24/7 · every day, all day.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Save changes"}));
    await waitFor(()=>expect(mocks.hours).toHaveBeenCalled());
    expect(mocks.hours.mock.calls[0][1].every((row:{open_time:string;close_time:string})=>row.open_time==="00:00"&&row.close_time==="00:00")).toBe(true);
  });
  it("requires explicit confirmation to remove separate hours and restores them on discard",()=>{
    const custom={...shared,hours:[...shared.hours,{...hours.hours[0],category:"Hair"}]};
    mountHours(custom);
    expect(screen.getByText("1 service group has separate hours below.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:/Different hours for some services/}));
    fireEvent.click(screen.getByRole("button",{name:"Use business hours"}));
    fireEvent.click(screen.getByRole("button",{name:"Cancel"}));
    expect(screen.queryByText("Changes ready to save")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Use business hours"}));
    fireEvent.click(within(screen.getByRole("group",{name:"Confirm using business hours"})).getByRole("button",{name:"Use business hours"}));
    expect(screen.getByText("All your services follow this schedule. You’re set.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Discard changes"}));
    expect(screen.getByText("1 service group has separate hours below.")).toBeInTheDocument();
  });
  it("sends removals and the saved snapshot rather than copying main hours into every category",async()=>{
    mocks.hours.mockResolvedValue({success:true});
    const custom={...shared,hours:[...shared.hours,{...hours.hours[0],category:"Hair"}]};
    mountHours(custom);
    fireEvent.click(screen.getByRole("button",{name:/Different hours for some services/}));
    fireEvent.click(screen.getByRole("button",{name:"Use business hours"}));
    fireEvent.click(within(screen.getByRole("group",{name:"Confirm using business hours"})).getByRole("button",{name:"Use business hours"}));
    fireEvent.click(screen.getByRole("button",{name:"Save changes"}));
    await waitFor(()=>expect(mocks.hours).toHaveBeenCalledWith("beautyfeel",[],{expectedHours:custom.hours,resetCategories:["Hair"]}));
  });
  it("blocks invalid times and no-day selections in the sheet",()=>{
    mountHours();
    fireEvent.click(screen.getByRole("button",{name:"Edit hours"}));
    fireEvent.change(screen.getByLabelText("Opens at"),{target:{value:"17:00"}});
    expect(screen.getByRole("button",{name:"Use these hours"})).toBeDisabled();
    expect(screen.getByText(/Choose Open 24 hours/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Opens at"),{target:{value:"09:00"}});
    screen.getAllByRole("checkbox").forEach(box=>fireEvent.click(box));
    expect(screen.getByRole("button",{name:"Use these hours"})).toBeDisabled();
  });
  it("offers consolidation for matching schedules without automatically changing them",()=>{
    const custom={...shared,hours:[...shared.hours,...shared.hours.map(row=>({...row,category:"Hair"}))]};
    mountHours(custom);
    fireEvent.click(screen.getByRole("button",{name:"Keep one schedule"}));
    expect(screen.getByRole("group",{name:"Confirm using business hours"})).toBeInTheDocument();
    expect(mocks.hours).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Cancel"}));
    expect(screen.queryByRole("button",{name:"Save changes"})).not.toBeInTheDocument();
  });
  it("makes a separate schedule independent without changing business hours",async()=>{
    mocks.hours.mockResolvedValue({success:true});
    mountHours();
    fireEvent.click(screen.getByRole("button",{name:/Different hours for some services/}));
    fireEvent.click(screen.getAllByRole("button",{name:"Set different hours"})[0]);
    fireEvent.click(screen.getByRole("button",{name:"Mon–Fri"}));
    fireEvent.change(screen.getByLabelText("Opens at"),{target:{value:"10:00"}});
    fireEvent.click(screen.getByRole("button",{name:"Use these hours"}));
    await waitFor(()=>expect(screen.queryByTestId("catalog-editor-overlay")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button",{name:"Save changes"}));
    await waitFor(()=>expect(mocks.hours).toHaveBeenCalled());
    const payload=mocks.hours.mock.calls[0][1];
    expect(payload).toHaveLength(7);
    expect(payload.every((row:{category:string})=>row.category==="Hair")).toBe(true);
    expect(payload.find((row:{day_of_week:number})=>row.day_of_week===6).open_time).toBe("09:00");
  });
  it("renders a matching cold skeleton and retryable error",async()=>{
    mocks.fetch.mockRejectedValue(new Error("offline"));
    mount(<OwnerBusinessHoursPreviewQuery redesign/>,client());
    expect(screen.getByLabelText("Loading business hours")).toHaveAttribute("aria-busy","true");
    expect(await screen.findByRole("button",{name:"Try again"})).toBeEnabled();
  });
});

describe("redesigned billing",()=>{
  it("preserves centavo amounts and uses a styled plan selector",()=>{
    mountBilling();
    expect(screen.getByText(/Subtotal ₱2,499.00 · Credits ₱500.00/)).toBeInTheDocument();
    expect(screen.getByRole("combobox",{name:"Target plan"})).toHaveTextContent("Pro");
    expect(screen.getByRole("combobox",{name:"Target plan"}).tagName).toBe("BUTTON");
    expect(screen.getByText(/Generating an invoice does not charge you/)).toBeInTheDocument();
  });
  it("submits payment references once without optimistically marking invoices paid",async()=>{
    let resolve!:(value:{success:boolean;error?:string})=>void;
    mocks.payment.mockReturnValue(new Promise(r=>{resolve=r;}));
    mountBilling();
    fireEvent.change(screen.getByRole("textbox",{name:"Payment reference"}),{target:{value:"REF-100"}});
    fireEvent.change(screen.getByLabelText("Amount paid in PHP (optional)"),{target:{value:"19.99"}});
    const button=screen.getByRole("button",{name:"Submit reference"});fireEvent.click(button);fireEvent.click(button);
    expect(mocks.payment).toHaveBeenCalledTimes(1);
    expect(mocks.payment).toHaveBeenCalledWith(expect.objectContaining({invoiceId:"invoice-a",paymentReference:"REF-100",amountCentavos:1999}));
    expect(screen.getByText("Open",{exact:true})).toBeInTheDocument();
    expect(screen.getByRole("textbox",{name:"Payment reference"})).toBeDisabled();
    await act(async()=>resolve({success:false,error:"Could not submit reference"}));
    expect(mocks.error).toHaveBeenCalledWith("Could not submit reference");
    expect(screen.getByRole("textbox",{name:"Payment reference"})).toHaveValue("REF-100");
    expect(screen.queryByText("Could not submit reference")).not.toBeInTheDocument();
  });
  it("confirms invoice creation through toast then refreshes the existing cache",async()=>{
    mocks.invoice.mockResolvedValue({success:true});mocks.fetch.mockResolvedValue(billing);
    mountBilling();fireEvent.click(screen.getByRole("button",{name:"Generate invoice"}));
    await waitFor(()=>expect(mocks.success).toHaveBeenCalledWith("Invoice generated."));
    expect(mocks.fetch).toHaveBeenCalledWith("/api/owner-dashboard-preview/beautyfeel/billing",expect.anything());
    expect(screen.queryByText("Invoice generated.")).not.toBeInTheDocument();
  });
  it("sends the selected plan for review and never upgrades optimistically",async()=>{
    mocks.upgrade.mockResolvedValue({success:false,error:"Plan request rejected"});
    mountBilling();fireEvent.change(screen.getByLabelText("Reason (optional)"),{target:{value:"More reports"}});
    fireEvent.click(screen.getByRole("button",{name:"Request upgrade"}));
    await waitFor(()=>expect(mocks.upgrade).toHaveBeenCalledWith({targetPlanCode:"PRO",note:"More reports"}));
    expect(screen.getByRole("heading",{name:"Plus"})).toBeInTheDocument();
    expect(screen.getByLabelText("Reason (optional)")).toHaveValue("More reports");
  });
  it("distinguishes a confirmed invoice from a failed follow-up refresh",async()=>{
    mocks.invoice.mockResolvedValue({success:true});mocks.fetch.mockRejectedValue(new Error("offline"));
    mountBilling();fireEvent.click(screen.getByRole("button",{name:"Generate invoice"}));
    await waitFor(()=>expect(mocks.error).toHaveBeenCalledWith("Billing was updated, but the latest records could not be loaded. Refresh to confirm."));
    expect(mocks.success).toHaveBeenCalledWith("Invoice generated.");
    expect(mocks.error).not.toHaveBeenCalledWith("Billing update failed. Please retry.");
  });
  it("honors pending upgrades and absent subscription records",()=>{
    mountBilling({...billing,subscription:null});
    expect(screen.getByRole("heading",{name:"No subscription record"})).toBeInTheDocument();
    expect(screen.queryByRole("button",{name:"Generate invoice"})).not.toBeInTheDocument();
    expect(screen.queryByRole("button",{name:"Request upgrade"})).not.toBeInTheDocument();
  });
});

describe("redesigned reports",()=>{
  it("uses warm real values and current filters in the export URL",()=>{
    mountReports();expect(screen.getByText("₱800")).toBeInTheDocument();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(screen.getByRole("link",{name:"Export report"})).toHaveAttribute("href","/api/reports/export?businessSlug=beautyfeel&tab=overview&format=xlsx&preset=30d&groupBy=day");
  });
  it("keeps breakdown terms and descriptions directly grouped within their list",()=>{
    mountReports();
    const breakdown=screen.getByRole("region",{name:"Booking volume"});
    const term=within(breakdown).getByText("accepted");
    expect(term.tagName).toBe("DT");
    expect(term.parentElement?.parentElement?.tagName).toBe("DL");
    expect(Array.from(term.parentElement?.children ?? []).map(child=>child.tagName)).toEqual(["DT","DD","DD"]);
  });
  it("keeps prior results visible on range failure and disables their export",async()=>{
    mocks.fetch.mockRejectedValue(new Error("offline"));mountReports();
    fireEvent.click(screen.getByRole("button",{name:"7D"}));
    expect(screen.getByText("₱800")).toBeInTheDocument();
    expect(screen.getByRole("button",{name:"Export report"})).toBeDisabled();
    await waitFor(()=>expect(screen.getByText(/The selected report could not be loaded/)).toBeInTheDocument());
    expect(screen.getByRole("button",{name:"Retry selected report"})).toBeEnabled();
  });
  it("blocks unsupported expenses exports after the correct report loads",async()=>{
    mocks.fetch.mockResolvedValue({tab:"expenses",range:overview.range,data:{kpis:{totalExpenses:25,entryCount:1,avgPerDay:1,topCategory:"Supplies",expenseToRevenueRatio:2.5},trend:[],entries:[],byCategory:[]}});
    mountReports();fireEvent.click(within(screen.getByRole("group",{name:"Report sections"})).getByRole("button",{name:"Expenses"}));
    expect(await screen.findByText("₱25")).toBeInTheDocument();
    expect(screen.getByRole("button",{name:"Export report"})).toBeDisabled();
    expect(screen.getByText("Expenses export is not available yet.")).toBeInTheDocument();
  });
  it("shows actual contributors, not a rate mixing current queue with historical work",async()=>{
    mocks.fetch.mockResolvedValue({tab:"operations",range:overview.range,data:{kpis:{completedServices:4,staffContributors:2,payrollTotal:200,payrollRatio:25,pendingQueueCount:1,medianPendingAgeHours:2},trend:[],staffPerformance:[]}});
    mountReports();fireEvent.click(screen.getByRole("button",{name:"Operations"}));
    expect(await screen.findByText("Staff contributors")).toBeInTheDocument();
    expect(screen.queryByText("Completion rate")).not.toBeInTheDocument();
  });
});
