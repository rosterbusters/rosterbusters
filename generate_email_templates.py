import os

template_base = """<!doctype html>
<html lang="und" dir="auto" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">

<head>
  <title></title>
  <!--[if !mso]><!-->
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <!--<![endif]-->
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style type="text/css">
    #outlook a {{ padding: 0; }}
    body {{ margin: 0; padding: 0; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }}
    table, td {{ border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }}
    img {{ border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }}
    p {{ display: block; margin: 13px 0; }}
  </style>
</head>

<body style="word-spacing:normal;background-color:#fafbfc;">
  <div aria-roledescription="email" style="background-color:#fafbfc;" role="article" lang="und" dir="auto">
    <div style="background:#ffffff;background-color:#ffffff;margin:0px auto;max-width:600px;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;background-color:#ffffff;width:100%;">
        <tbody>
          <tr>
            <td style="direction:ltr;font-size:0px;padding:40px 20px;text-align:center;">
              <div class="mj-column-per-100 mj-outlook-group-fix" style="font-size:0px;text-align:left;direction:ltr;display:inline-block;vertical-align:middle;width:100%;">
                <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="vertical-align:middle;" width="100%">
                  <tbody>
                    <tr>
                      <td align="center" style="font-size:0px;padding:35px;word-break:break-word;">
                        <div style="font-family:Arial, Helvetica, sans-serif;font-size:20px;line-height:1;text-align:center;color:#333333;">{{ project_name }}</div>
                      </td>
                    </tr>
                    <tr>
                      <td align="center" style="font-size:0px;padding:10px 25px;padding-right:25px;padding-left:25px;word-break:break-word;">
                        <div style="font-family:Arial, Helvetica, sans-serif;font-size:16px;line-height:1.3;text-align:center;color:#555555;">
                          <span>{msg1}</span>
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td align="center" style="font-size:0px;padding:10px 25px;word-break:break-word;">
                        <div style="font-family:Arial, Helvetica, sans-serif;font-size:14px;line-height:1.4;text-align:center;color:#666666;">
                          <span>{msg2}</span>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</body>

</html>
"""

configs = [
    {
        "filename": "shift_request_closing_soon.html",
        "msg1": "Shift Request Period ({{ roster_period }}) is closing soon (24h).",
        "msg2": "Please submit your shift requests before the window closes."
    },
    {
        "filename": "shift_request_closing_soon_12h.html",
        "msg1": "Shift Request Period ({{ roster_period }}) is closing soon (12h).",
        "msg2": "Please submit your shift requests before the window closes."
    },
    {
        "filename": "shift_request_review_open.html",
        "msg1": "Shift Request Review Period ({{ roster_period }}) is now open.",
        "msg2": "You can now review shift requests from ward staff."
    },
    {
        "filename": "shift_request_review_closing_soon.html",
        "msg1": "Shift Request Review Period ({{ roster_period }}) is closing soon (12h).",
        "msg2": "Please complete your review before the window closes."
    },
    {
        "filename": "hris_portal_open.html",
        "msg1": "HRIS Export Portal for ({{ roster_period }}) is now open.",
        "msg2": "Please upload the finalised roster to the HRIS system."
    },
    {
        "filename": "hris_portal_closing_soon.html",
        "msg1": "HRIS Export Portal for ({{ roster_period }}) is closing soon (12h).",
        "msg2": "Please upload the finalised roster to the HRIS system before the window closes."
    }
]

dir_path = r"backend\app\email-templates\build"
for config in configs:
    content = template_base.format(msg1=config["msg1"], msg2=config["msg2"]).replace('{{ project_name }}', '{{ project_name }}')
    file_path = os.path.join(dir_path, config["filename"])
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)

print("Generated templates.")
