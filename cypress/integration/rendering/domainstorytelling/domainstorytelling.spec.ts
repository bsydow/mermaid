import { imgSnapshotTest } from '../../../helpers/util.ts';

describe('Domain Storytelling Diagram', () => {
  it('1: should render a simple domain story', () => {
    imgSnapshotTest(
      `domainstorytelling-beta
A_Customer : 01 -- "places" -> W_Order
A_Service : 02 -- "processes" -> W_Order
      `
    );
  });

  it('2: should render actors and work objects with icons and labels', () => {
    imgSnapshotTest(
      `domainstorytelling-beta
A_Customer "Customer" fa:fa-user
A_System "System" fa:fa-server
W_Order "Order" fa:fa-shopping-cart
W_Payment "Payment" fa:fa-credit-card

A_Customer : 01 -- "places" -> W_Order
A_System : 02 -- "processes" -> W_Payment
      `
    );
  });

  it('3: should render groups with members', () => {
    imgSnapshotTest(
      `domainstorytelling-beta
W_Order fa:fa-file-alt
W_Package fa:fa-box
group G_Frontend "Customer Area"
group G_Backoffice "Backoffice"

A_Customer fa:fa-user in G_Frontend
A_SalesClerk fa:fa-user-tie in G_Backoffice
A_Warehouse fa:fa-warehouse in G_Backoffice

A_Customer : 01 -- "places" -> W_Order
A_SalesClerk : 02 -- "processes" -> W_Order
A_Warehouse : 03 -- "packs" -> W_Package -- "for" -> W_Order
      `
    );
  });

  it('4: should render nested groups', () => {
    imgSnapshotTest(
      `domainstorytelling-beta
W_Task fa:fa-tasks
W_Build fa:fa-cogs
W_Report fa:fa-chart-bar
group G_Company "Company"
group G_Engineering "Engineering" in G_Company
group G_QA "Quality Assurance" in G_Company

A_Manager fa:fa-user-tie in G_Company
A_Dev fa:fa-laptop-code in G_Engineering
A_QA fa:fa-check-circle in G_QA

A_Manager : 01 -- "assigns" -> W_Task
A_Dev : 02 -- "implements" -> W_Task -- "produces" -> W_Build
A_QA : 03 -- "verifies" -> W_Build -- "writes" -> W_Report
      `
    );
  });

  it('5: should render group block with member sentences', () => {
    imgSnapshotTest(
      `domainstorytelling-beta

group G_Backoffice "Backoffice" {
  A_SalesClerk : 01 -- "creates" -> W_Order
  A_Warehouse : 02 -- "packs" -> W_Package
  A_Warehouse : 03 -- "labels" -> W_Label in G_Logistics
}

group G_Logistics "Logistics"

A_Shipping : 04 -- "ships" -> W_Package
      `
    );
  });

  it('6: should render mixed continuation segments', () => {
    imgSnapshotTest(
      `domainstorytelling-beta
A_D : 01 -- "collaborates on" -> W_W <- "collaborates on" -- A_E <- "collaborates on" -- A_F
A_D : 02 -- "works on" -> W_X -- "using" -> W_Y -- "writing" -> W_Z
      `
    );
  });

  it('7: should render annotations on actors, groups, sentences, and work objects', () => {
    imgSnapshotTest(
      `domainstorytelling-beta
group G_Service "Service Desk"
A_Agent "Support Agent" in G_Service
A_Customer "Customer"

A_Customer : 01 -- "reports" -> W_Ticket id S_ReportTicket
A_Agent : 02 -- "triages" -> W_Backlog id S_Triage
A_Agent : 03 -- "updates" -> W_Ticket id S_UpdateTicket
A_Agent : 03 -- "closes" -> W_Ticket id S_CloseTicket

annotate actor A_Agent "Handles edge cases and escalation."

annotate group G_Service "Team policy and context."

annotate sentence 01 "Initial ticket creation."

annotate sentence S_CloseTicket "Closing path uses sentence id."

annotate workobject W_Ticket@01 "Initial ticket instance."

annotate workobject W_Ticket@S_CloseTicket "Closed ticket instance."
      `
    );
  });

  it('8: should render with custom domainstorytelling config and title', () => {
    imgSnapshotTest(
      `
---
title: Going to the movies
config:
  domainstorytelling:
    rankdir: TB
    nodeSpacing: 50
    rankSpacing: 100
---
domainstorytelling-beta

A_Cashier "Cashier" fa:fa-user
A_Moviegoer "Moviegoer" fa:fa-user
A_Usher "Usher" fa:fa-user
W_Ticket "Ticket" fa:fa-ticket-alt

group G_TicketSales "Ticket Sales" {
  A_Moviegoer : 01 -- "buys" -> W_Ticket -- "from" -> A_Cashier
}

group G_Entrance "Entrance Control" {
  A_Moviegoer : 02 -- "shows" -> W_Ticket -- "to" -> A_Usher
  A_Usher : 03 -- "checks" -> W_Ticket
}
      `
    );
  });

  it('9: should render actors and work objects without prior declaration', () => {
    imgSnapshotTest(
      `domainstorytelling-beta
A_Anna : 01 -- "writes" -> W_Email -- "to" -> A_Bob
A_Bob : 02 -- "replies to" -> W_Email
      `
    );
  });

  it('10: should render with the ELK layout (config.layout: elk)', () => {
    imgSnapshotTest(
      `
---
title: Service Desk — ELK layout
config:
  layout: elk
---
domainstorytelling-beta
group G_Service "Service Desk"
group G_Engineering "Engineering"

A_Customer "Customer" fa:fa-user in G_Service
A_Agent "Support Agent" fa:fa-headset in G_Service
A_Engineer "Engineer" fa:fa-laptop-code in G_Engineering
W_Ticket "Ticket" fa:fa-ticket-alt
W_Fix "Fix" fa:fa-wrench

A_Customer : 01 -- "reports" -> W_Ticket in G_Service -- "to" -> A_Agent id S_Report
A_Agent : 02 -- "escalates" -> W_Ticket -- "to" -> A_Engineer id S_Escalate
A_Engineer : 03 -- "implements" -> W_Fix in G_Engineering -- "for" -> W_Ticket in G_Engineering id S_Fix

annotate actor A_Engineer "Owns root-cause analysis and the fix."

annotate sentence 01 "Entry point of the story."
      `
    );
  });
});
