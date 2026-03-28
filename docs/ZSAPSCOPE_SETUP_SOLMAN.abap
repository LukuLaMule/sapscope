*&---------------------------------------------------------------------*
*& ZSAPSCOPE_SETUP_SOLMAN
*& SolMan variant — run on Solution Manager.
*& Reads all managed systems from LMDB and executes ZSAPSCOPE_SETUP
*& remotely on each one via RFC.
*&
*& Prerequisites:
*&   - Run on SAP Solution Manager (any release)
*&   - RFC destinations to managed systems must exist (SM59)
*&   - ZSAPSCOPE_SETUP must be created (SE38) on each managed system
*&     OR use option p_push = 'X' to push the code via RFC_ABAP_INSTALL_AND_RUN
*&   - S_RFC ACTVT=16 on RFC destinations to managed systems
*&---------------------------------------------------------------------*
REPORT zsapscope_setup_solman.

PARAMETERS: p_pass TYPE string LOWER CASE OBLIGATORY,
            p_test TYPE abap_bool AS CHECKBOX DEFAULT abap_true.

TYPES: BEGIN OF ty_system,
         sid      TYPE lmdb_e_sid,
         rfc_dest TYPE rfcdest,
       END OF ty_system.

DATA: lt_systems TYPE TABLE OF ty_system.

START-OF-SELECTION.
  PERFORM get_managed_systems.
  PERFORM run_remote_setup.

*----------------------------------------------------------------------*
* Read active managed systems from LMDB
*----------------------------------------------------------------------*
FORM get_managed_systems.
  DATA: lt_lmdb  TYPE TABLE OF lmdb_a_abap_sys,
        ls_lmdb  TYPE lmdb_a_abap_sys,
        ls_sys   TYPE ty_system.

  " Read ABAP systems registered in LMDB
  SELECT * FROM lmdb_a_abap_sys INTO TABLE lt_lmdb
    WHERE active = 'X'.

  LOOP AT lt_lmdb INTO ls_lmdb.
    ls_sys-sid      = ls_lmdb-sid.
    " RFC destination convention: <SID>CLNT<CLIENT> or plain <SID>
    " Adjust to match your SM59 naming convention
    CONCATENATE ls_lmdb-sid 'CLNT' ls_lmdb-client INTO ls_sys-rfc_dest.
    APPEND ls_sys TO lt_systems.
  ENDLOOP.

  WRITE: / sy-tfill, 'managed ABAP system(s) found in LMDB:'.
  LOOP AT lt_systems INTO ls_sys.
    WRITE: / '  ', ls_sys-sid, '→ RFC:', ls_sys-rfc_dest.
  ENDLOOP.
ENDFORM.

*----------------------------------------------------------------------*
* Execute setup on each system via RFC
*----------------------------------------------------------------------*
FORM run_remote_setup.
  DATA: ls_sys     TYPE ty_system,
        lt_return  TYPE TABLE OF bapiret2,
        ls_return  TYPE bapiret2,
        lv_result  TYPE string.

  IF p_test = abap_true.
    WRITE: / 'TEST MODE — no changes made. Uncheck "Test" to execute.'.
    RETURN.
  ENDIF.

  LOOP AT lt_systems INTO ls_sys.
    WRITE: / 'Processing', ls_sys-sid, '...'.

    " Check RFC destination is reachable
    CALL FUNCTION 'RFC_PING'
      DESTINATION ls_sys-rfc_dest
      EXCEPTIONS
        communication_failure = 1
        system_failure        = 2
        OTHERS                = 3.
    IF sy-subrc <> 0.
      WRITE: / '  ERROR: RFC destination', ls_sys-rfc_dest, 'unreachable — skipping.'.
      CONTINUE.
    ENDIF.

    " Run ZSAPSCOPE_SETUP remotely
    " ZSAPSCOPE_SETUP must exist on the target system (created via SE38)
    CALL FUNCTION 'RFC_REMOTE_EXEC'
      DESTINATION ls_sys-rfc_dest
      EXPORTING
        function = 'ZSAPSCOPE_SETUP'
      EXCEPTIONS
        OTHERS   = 1.
    " Note: RFC_REMOTE_EXEC is for function modules.
    " For a report, use RFC_ABAP_INSTALL_AND_RUN or SUSR_* BAPIs directly.

    " More practical: call user+role creation BAPIs directly on remote system
    CALL FUNCTION 'BAPI_USER_CREATE1'
      DESTINATION ls_sys-rfc_dest
      EXPORTING
        username  = 'SAPSCOPE'
      TABLES
        return    = lt_return
      EXCEPTIONS
        OTHERS    = 1.

    IF sy-subrc <> 0.
      WRITE: / '  ERROR: RFC call failed for', ls_sys-sid.
      CONTINUE.
    ENDIF.

    LOOP AT lt_return INTO ls_return WHERE type CA 'EAX'.
      WRITE: / '  Error on', ls_sys-sid, ':', ls_return-message.
    ENDLOOP.

    IF sy-subrc = 0.
      WRITE: / '  OK:', ls_sys-sid.
    ELSE.
      WRITE: / '  ERROR on', ls_sys-sid, ': rc=', sy-subrc.
    ENDIF.

  ENDLOOP.

  WRITE: /.
  WRITE: / 'Done. Check results above for any errors.'.
  WRITE: / 'Reminder: role Z_SAPSCOPE authorizations are local per system.'.
  WRITE: / 'Run ZSAPSCOPE_SETUP on each system to create the role if not done.'.
ENDFORM.
