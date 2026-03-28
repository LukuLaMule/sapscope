*&---------------------------------------------------------------------*
*& ZSAPSCOPE_SETUP_CUA
*& CUA variant — run on the CUA central system only.
*& Creates user SAPSCOPE centrally (replicated to all child systems).
*& The role Z_SAPSCOPE must be created locally in each child system
*& using ZSAPSCOPE_SETUP (authorizations are always local in CUA).
*&
*& Prerequisites:
*&   - Run on the CUA central system
*&   - S_USER_GRP ACTVT=01 + S_USER_SYS ACTVT=01 authorizations
*&---------------------------------------------------------------------*
REPORT zsapscope_setup_cua.

PARAMETERS: p_pass TYPE string LOWER CASE OBLIGATORY.

CONSTANTS: c_user TYPE xubname VALUE 'SAPSCOPE'.

AUTHORITY-CHECK OBJECT 'S_USER_GRP'
  ID 'CLASS' DUMMY
  ID 'ACTVT' FIELD '01'.
IF sy-subrc <> 0.
  MESSAGE 'Insufficient authorization (S_USER_GRP ACTVT=01).' TYPE 'E'.
ENDIF.

START-OF-SELECTION.
  PERFORM check_cua.
  PERFORM create_user_cua.

*----------------------------------------------------------------------*
* Verify this system is a CUA central system
*----------------------------------------------------------------------*
FORM check_cua.
  DATA: lv_central TYPE uszbvfall.
  CALL FUNCTION 'SUSR_CUA_IS_CENTRAL'
    IMPORTING central = lv_central.
  IF lv_central IS INITIAL.
    WRITE: / 'WARNING: This system does not appear to be a CUA central system.'.
    WRITE: / 'Use ZSAPSCOPE_SETUP (SE38) on each system instead.'.
    RETURN.
  ENDIF.
  WRITE: / 'CUA central system confirmed.'.
ENDFORM.

*----------------------------------------------------------------------*
* Create user via CUA — replicates to all active child systems
*----------------------------------------------------------------------*
FORM create_user_cua.
  DATA: ls_address   TYPE bapiaddr3,
        ls_logondata TYPE bapilogond,
        ls_password  TYPE bapipwd,
        lt_systems   TYPE TABLE OF bapicuasys,
        ls_system    TYPE bapicuasys,
        lt_return    TYPE TABLE OF bapiret2,
        ls_return    TYPE bapiret2,
        lv_exists    TYPE abap_bool.

  " Check if user already exists
  CALL FUNCTION 'SUSR_USER_EXISTS'
    EXPORTING bname  = c_user
    IMPORTING exists = lv_exists.
  IF lv_exists = abap_true.
    WRITE: / 'User', c_user, 'already exists in CUA — skipping.'.
    WRITE: / 'Reminder: create role Z_SAPSCOPE locally in each child system'.
    WRITE: / 'using ZSAPSCOPE_SETUP, then assign it manually via SU01.'.
    RETURN.
  ENDIF.

  " Collect all active CUA child systems
  SELECT logon_sys FROM uszbvsys INTO ls_system-system
    WHERE active = 'X'.
    APPEND ls_system TO lt_systems.
  ENDSELECT.

  DESCRIBE TABLE lt_systems.
  WRITE: / sy-tfill, 'active CUA child system(s) found.'.

  ls_address-firstname = 'SAPscope'.
  ls_address-lastname  = 'Agent'.

  ls_logondata-ustyp = 'S'.
  ls_logondata-gltgv = sy-datum.
  ls_logondata-gltgb = '99991231'.

  ls_password-bapipwd = p_pass.

  " BAPI_USER_CREATE1 on CUA central + SYSTEMS parameter = global creation
  CALL FUNCTION 'BAPI_USER_CREATE1'
    EXPORTING
      username  = c_user
      address   = ls_address
      logondata = ls_logondata
      password  = ls_password
    TABLES
      systems   = lt_systems
      return    = lt_return.

  LOOP AT lt_return INTO ls_return WHERE type CA 'EAX'.
    WRITE: / 'Error:', ls_return-message.
    RETURN.
  ENDLOOP.

  CALL FUNCTION 'BAPI_TRANSACTION_COMMIT' EXPORTING wait = 'X'.

  WRITE: / 'User SAPSCOPE created and replicated to all child systems.'.
  WRITE: /.
  WRITE: / '*** NEXT STEP ***'.
  WRITE: / 'Run ZSAPSCOPE_SETUP (SE38) on each child system to create'.
  WRITE: / 'role Z_SAPSCOPE locally, then assign it to SAPSCOPE via SU01.'.
ENDFORM.
