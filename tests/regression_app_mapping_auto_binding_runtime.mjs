import assert from "node:assert/strict";
import path from "node:path";

async function main() {
  const root = process.cwd();
  const runtime = await import(`${path.join(root, "dist-app/main/mappingAutoBindingRuntime.js")}?t=${Date.now()}`);

  const result = runtime.applyMappingAutoBindings({
    mappingArtifacts: [
      {
        runId: "sheet-run:test",
        section: {
          spreadsheetId: "spreadsheet-123",
          sheetName: "운영시트",
          sheetId: null,
          sectionKey: "GANGNAM",
          state: "active",
          titleRow: 1,
          headerRow: 4,
          roomStartRow: 6,
          inventoryStartRow: 21
        },
        anchors: [],
        bindings: [],
        unresolved: [],
        providerValueSource: {
          providerKey: "NAVER",
          providerRow: 10,
          providerValueRow: 11,
          providerRowRole: "aggregate-only",
          sourceKind: "typed-row",
          sourceReason: "fallback_to_better_data_row",
          typedSlotRows: {
            urban: 12,
            doubleTwin: null,
            grand: null
          },
          typedSlotComplete: false,
          typedSlotDuplicate: false
        },
        structuralSummary: [],
        validationSummary: {
          providerKey: "NAVER",
          issueCount: 0,
          errorCount: 0,
          warningCount: 0,
          issueCodes: [],
          hasTypeMismatch: false,
          hasPartitionMismatch: false,
          hasInsufficientRows: false,
          providerValueRawCount: 0,
          providerValueParsedCount: 0,
          providerRow: 10,
          providerValueRow: 11,
          providerRowRole: "aggregate-only",
          providerValueSourceKind: "typed-row",
          providerValueSourceReason: "fallback_to_better_data_row",
          typedSlotRows: {
            urban: 12,
            doubleTwin: null,
            grand: null
          },
          typedSlotComplete: false,
          typedSlotDuplicate: false,
          physicalOrderVariant: false
        }
      }
    ],
    snapshot: {
      readHints: {
        roomTypeByRoomNo: {
          "1001": "Urban"
        },
        localRoomTypeByRoomNo: {
          B1101: "Double Twin"
        }
      },
      reservationBlocks: [
        {
          kind: "RESERVATION",
          blockId: "sheet-1",
          branch: "GANGNAM",
          roomNo: "1001",
          roomType: "Urban",
          channel: "BOOKING",
          note: "예약번호 25170918 / 예약자 홍길동 / 연락처 010-1234-5678 / booking",
          dateKeys: ["2026-03-01", "2026-03-02"]
        }
      ]
    },
    summary: {
      spreadsheetId: "spreadsheet-123",
      sheetName: "운영시트",
      startDate: "2026-03-01",
      endDate: "2026-03-03",
      readMode: "full",
      retryReason: null,
      retryTrace: [],
      failureCategory: "none",
      failureDetail: "",
      reservationBlockCount: 1,
      validationIssueCount: 0,
      inventoryRows: {
        NAVER: 10,
        STATION: null
      },
      providerValueDays: {
        NAVER: 3,
        STATION: 0
      },
      anchorSummary: {
        namedRangeCount: 0,
        metadataCount: 0,
        hasScanConfigNamedRange: false,
        hasRoomMapNamedRange: false,
        hasMetadataScanConfig: false,
        manualAnchorUsed: false,
        manualAnchorFields: []
      },
      hintSummary: {
        fingerprint: "fingerprint-1",
        roomMapCount: 1,
        scanMode: "auto",
        manualMode: false,
        hasRoomTypeMap: true,
        branch: "GANGNAM",
        branchSectionEvidence: ["branch:GANGNAM"]
      },
      validationSummary: {
        providerKey: "NAVER",
        issueCount: 0,
        errorCount: 0,
        warningCount: 0,
        issueCodes: [],
        hasTypeMismatch: false,
        hasPartitionMismatch: false,
        hasInsufficientRows: false,
        providerValueRawCount: 0,
        providerValueParsedCount: 0,
        providerRow: 10,
        providerValueRow: 11,
        providerRowRole: "aggregate-only",
        providerValueSourceKind: "typed-row",
        providerValueSourceReason: "fallback_to_better_data_row",
        typedSlotRows: {
          urban: 12,
          doubleTwin: null,
          grand: null
        },
        typedSlotComplete: false,
        typedSlotDuplicate: false,
        physicalOrderVariant: false
      },
      coverage: {
        dateCount: 3,
        inventoryRowsDetected: {
          NAVER: true,
          STATION: false
        },
        inventoryValueRowsDetected: {
          NAVER: true,
          STATION: false
        },
        inventoryDataRowCounts: {
          NAVER: 1,
          STATION: 0
        },
        providerValueDays: {
          NAVER: 3,
          STATION: 0
        },
        reservationBlockCount: 1
      }
    },
    providerReservations: [
      {
        sourceSystem: "PMS",
        reservationNo: "25170918",
        reservationRef: "",
        channel: "BOOKING",
        checkin: "2026-03-01",
        checkout: "2026-03-03",
        nights: 2,
        roomNo: "1001",
        roomNos: ["1001"],
        price: 0,
        account: "",
        sourceCode: "BOOKING",
        status: "RC",
        statusBucket: "ACTIVE",
        auditAnomaly: false,
        branch: "GANGNAM",
        nationalityCode: "",
        languageCode: "",
        languageName: "",
        guestName: "홍길동",
        phoneTail: "5678",
        remarkHead: "예약번호 25170918 / 예약자 홍길동",
        identitySoftKey: "",
        identityTokenHashes: []
      }
    ]
  });

  const [artifact] = result;
  const roomAliasBindings = artifact.bindings.filter((binding) => binding.termId === "inventory.room-alias");
  const reservationIdentityBindings = artifact.bindings.filter((binding) => binding.termId === "reservation.identity");

  assert.equal(roomAliasBindings.length >= 2, true);
  assert.equal(
    roomAliasBindings.some((binding) => binding.resolvedCanonicalId === "GANGNAM-B-1001"),
    true
  );
  assert.equal(
    roomAliasBindings.some((binding) => binding.resolvedCanonicalId === "GANGNAM-B-1101"),
    true
  );
  assert.equal(reservationIdentityBindings.length, 1);
  assert.equal(reservationIdentityBindings[0].resolvedCanonicalId, "reservation:25170918");
  assert.equal(artifact.metrics?.autoBindingCount, 3);

  console.log("regression_app_mapping_auto_binding_runtime: OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
