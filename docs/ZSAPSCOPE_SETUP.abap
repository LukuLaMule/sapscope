*&---------------------------------------------------------------------*
*& ZSAPSCOPE_SETUP
*& Creates the SAPSCOPE RFC user and authorization role.
*& Run once per SAP system via SE38 (F8).
*& Safe to re-run — skips objects that already exist.
*&---------------------------------------------------------------------*
REPORT zsapscope_setup.

PARAMETERS: p_pass TYPE string LOWER CASE OBLIGATORY,
            p_clnt TYPE sy-mandt DEFAULT sy-mandt.

*----------------------------------------------------------------------*
* Constants
*----------------------------------------------------------------------*
CONSTANTS: c_user   TYPE xubname VALUE 'SAPSCOPE',
           c_role   TYPE agr_name VALUE 'Z_SAPSCOPE'.

*----------------------------------------------------------------------*
* Authorization check — caller must have S_USER_GRP (user admin)
*----------------------------------------------------------------------*
AUTHORITY-CHECK OBJECT 'S_USER_GRP'
  ID 'CLASS'    DUMMY
  ID 'ACTVT'    FIELD '01'.
IF sy-subrc <> 0.
  MESSAGE 'Insufficient authorization. Requires S_USER_GRP with ACTVT=01.' TYPE 'E'.
ENDIF.

START-OF-SELECTION.
  PERFORM create_role.
  PERFORM create_user.
  WRITE: / 'SAPSCOPE setup complete.'.
  WRITE: / 'User: SAPSCOPE | Type: S | Role: Z_SAPSCOPE'.

*----------------------------------------------------------------------*
* Create role Z_SAPSCOPE with required authorizations
*----------------------------------------------------------------------*
FORM create_role.
  DATA: ls_agr    TYPE agr_define,
        ls_auth   TYPE agr_1251,
        lt_auth   TYPE TABLE OF agr_1251,
        lv_exists TYPE abap_bool.

  " Check if role already exists
  SELECT SINGLE agr_name FROM agr_define INTO ls_agr-agr_name
    WHERE agr_name = c_role.
  IF sy-subrc = 0.
    WRITE: / 'Role', c_role, 'already exists — skipping creation.'.
    RETURN.
  ENDIF.

  " Create role header
  ls_agr-agr_name = c_role.
  ls_agr-agr_title = 'SAPscope RFC read-only agent'.
  ls_agr-mandt = sy-mandt.
  INSERT agr_define FROM ls_agr.

  " S_RFC: allow RFC_READ_TABLE and RFC_SYSTEM_INFO
  CLEAR ls_auth.
  ls_auth-agr_name  = c_role.
  ls_auth-object    = 'S_RFC'.
  ls_auth-auth      = 'SAPSCOPE01'.
  ls_auth-field     = 'RFC_TYPE'.
  ls_auth-low       = 'FUGR'.
  APPEND ls_auth TO lt_auth.

  ls_auth-field = 'RFC_NAME'.
  ls_auth-low   = 'RFC_READ_TABLE'.
  APPEND ls_auth TO lt_auth.
  ls_auth-low   = 'RFC_SYSTEM_INFO'.
  APPEND ls_auth TO lt_auth.
  ls_auth-low   = 'RFCPING'.
  APPEND ls_auth TO lt_auth.

  ls_auth-field = 'ACTVT'.
  ls_auth-low   = '16'.
  APPEND ls_auth TO lt_auth.

  " S_TABU_NAM: read CVERS, PAT03, TADIR
  CLEAR ls_auth.
  ls_auth-agr_name = c_role.
  ls_auth-object   = 'S_TABU_NAM'.
  ls_auth-auth     = 'SAPSCOPE02'.
  ls_auth-field    = 'TABLE'.
  ls_auth-low      = 'CVERS'.  APPEND ls_auth TO lt_auth.
  ls_auth-low      = 'PAT03'.  APPEND ls_auth TO lt_auth.
  ls_auth-low      = 'TADIR'.  APPEND ls_auth TO lt_auth.

  ls_auth-field    = 'ACTVT'.
  ls_auth-low      = '03'.
  APPEND ls_auth TO lt_auth.

  INSERT agr_1251 FROM TABLE lt_auth.

  WRITE: / 'Role', c_role, 'created.'.
ENDFORM.

*----------------------------------------------------------------------*
* Create user SAPSCOPE (type S — system user)
*----------------------------------------------------------------------*
FORM create_user.
  DATA: ls_address  TYPE bapiaddr3,
        ls_logondata TYPE bapilogond,
        ls_password  TYPE bapipwd,
        lt_roles     TYPE TABLE OF bapiagr,
        ls_role      TYPE bapiagr,
        lt_return    TYPE TABLE OF bapiret2,
        ls_return    TYPE bapiret2,
        lv_exists    TYPE abap_bool.

  " Check if user already exists
  CALL FUNCTION 'SUSR_USER_EXISTS'
    EXPORTING bname = c_user
    IMPORTING exists = lv_exists.

  IF lv_exists = abap_true.
    WRITE: / 'User', c_user, 'already exists — skipping creation.'.
    " Still ensure role is assigned
    PERFORM assign_role.
    RETURN.
  ENDIF.

  " Build user data
  ls_address-firstname = 'SAPscope'.
  ls_address-lastname  = 'Agent'.

  ls_logondata-ustyp   = 'S'.   " System user — no GUI, no password expiry
  ls_logondata-gltgv   = sy-datum.
  ls_logondata-gltgb   = '99991231'.

  ls_password-bapipwd  = p_pass.

  CALL FUNCTION 'BAPI_USER_CREATE1'
    EXPORTING
      username  = c_user
      address   = ls_address
      logondata = ls_logondata
      password  = ls_password
    TABLES
      return    = lt_return.

  LOOP AT lt_return INTO ls_return WHERE type CA 'EAX'.
    WRITE: / 'Error creating user:', ls_return-message.
    RETURN.
  ENDLOOP.

  CALL FUNCTION 'BAPI_TRANSACTION_COMMIT' EXPORTING wait = 'X'.
  WRITE: / 'User', c_user, 'created (type S).'.

  PERFORM assign_role.
ENDFORM.

*----------------------------------------------------------------------*
* Assign role Z_SAPSCOPE to user SAPSCOPE
*----------------------------------------------------------------------*
FORM assign_role.
  DATA: lt_roles  TYPE TABLE OF bapiagr,
        ls_role   TYPE bapiagr,
        lt_return TYPE TABLE OF bapiret2,
        ls_return TYPE bapiret2.

  ls_role-agr_name = c_role.
  ls_role-from_dat = sy-datum.
  ls_role-to_dat   = '99991231'.
  APPEND ls_role TO lt_roles.

  CALL FUNCTION 'BAPI_USER_ROLES_ASSIGN'
    EXPORTING username = c_user
    TABLES   roles     = lt_roles
             return    = lt_return.

  LOOP AT lt_return INTO ls_return WHERE type CA 'EAX'.
    WRITE: / 'Error assigning role:', ls_return-message.
    RETURN.
  ENDLOOP.

  CALL FUNCTION 'BAPI_TRANSACTION_COMMIT' EXPORTING wait = 'X'.
  WRITE: / 'Role', c_role, 'assigned to', c_user.
ENDFORM.
