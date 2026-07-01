interface FuncInfo {
  name: string;
  paramCount: number;
}

function extractFuncInfo(code: string, language: string): FuncInfo | null {
  let match: RegExpMatchArray | null = null;

  if (language === "javascript" || language === "typescript") {
    match = code.match(/function\s+(\w+)\s*\(([^)]*)\)/);
  } else if (language === "python") {
    match = code.match(/def\s+(\w+)\s*\(([^)]*)\)/);
  } else if (language === "ruby") {
    match = code.match(/def\s+(\w+)\s*(?:\(([^)]*)\))?/);
  }

  if (!match) return null;

  const name = match[1];
  const paramStr = (match[2] ?? "").trim();
  const paramCount = paramStr
    ? paramStr
        .split(",")
        .map((p) => p.trim().split(/[:=]/)[0].trim())
        .filter((p) => p && p !== "self")
        .length
    : 0;

  return { name, paramCount };
}

function extractCppFuncInfo(code: string): { name: string; params: Array<{type: string; name: string}>; returnType: string } | null {
  const m = code.match(/\b(vector\s*<[^>]+>|string|bool|int|long\s+long|long|double|float|char|void)\s+(\w+)\s*\(([^)]*)\)\s*\{/);
  if (!m || m[2] === "main") return null;
  const returnType = m[1].trim();
  const name = m[2];
  const paramStr = m[3].trim();
  if (!paramStr) return { name, params: [], returnType };
  const params = paramStr.split(",").map((p, i) => {
    p = p.trim().replace(/\bconst\b/g, "").replace(/[*&]/g, "").trim();
    const parts = p.match(/^(.+?)\s+(\w+)$/);
    if (!parts) return { type: "auto", name: `_p${i}` };
    return { type: parts[1].trim(), name: parts[2] };
  });
  return { name, params, returnType };
}

function cppReadParam(type: string, varName: string, idx: number): string {
  const t = type.replace(/\s+/g, " ").trim();
  const src = `_lines[${idx}]`;
  if (t === "int") return `int ${varName}=stoi(${src});`;
  if (t === "long long" || t === "long") return `long long ${varName}=stoll(${src});`;
  if (t === "double" || t === "float") return `double ${varName}=stod(${src});`;
  if (t === "bool") return `bool ${varName}=(${src}=="true"||${src}=="1");`;
  if (t === "string") return `string ${varName}=${src};if(!${varName}.empty()&&${varName}[0]==(char)34)${varName}=${varName}.substr(1,${varName}.size()-2);`;
  if (t.startsWith("vector") && t.includes("string")) return `vector<string> ${varName};{string _n=${src};if(!_n.empty()&&_n[0]=='[')_n=_n.substr(1,_n.size()-2);if(!_n.empty()){stringstream _ss(_n);string _t;while(getline(_ss,_t,',')){_t.erase(remove(_t.begin(),_t.end(),(char)34),_t.end());${varName}.push_back(_t);}}}`;
  if (t.startsWith("vector")) return `vector<int> ${varName};{string _n=${src};if(!_n.empty()&&_n[0]=='[')_n=_n.substr(1,_n.size()-2);if(!_n.empty()){stringstream _ss(_n);string _t;while(getline(_ss,_t,',')){${varName}.push_back(stoi(_t));}}}`;
  return `string ${varName}=${src};`;
}

function cppPrintResult(returnType: string, call: string): string {
  const t = returnType.trim();
  if (t === "void") return `${call};`;
  if (t === "bool") return `cout<<(${call}?"true":"false")<<endl;`;
  if (t.startsWith("vector") && t.includes("string")) return `{auto _r=${call};cout<<(char)91;for(int _i=0;_i<(int)_r.size();_i++){if(_i)cout<<(char)44;cout<<(char)34<<_r[_i]<<(char)34;}cout<<(char)93<<endl;}`;
  if (t.startsWith("vector")) return `{auto _r=${call};cout<<(char)91;for(int _i=0;_i<(int)_r.size();_i++){if(_i)cout<<(char)44;cout<<_r[_i];}cout<<(char)93<<endl;}`;
  return `cout<<${call}<<endl;`;
}

/**
 * Wraps user code with a stdin-reading driver that calls the detected function
 * and prints the return value to stdout. Only applied when stdin is provided
 * (i.e. test-case runs). Falls back to the original code if no function is found
 * or the language is not supported.
 */
export function wrapWithDriver(code: string, language: string): string {
  // Java is handled separately — uses reflection, doesn't need extractFuncInfo
  if (language === "java") {
    const cleanCode = code.replace(/\bpublic\s+(class\s)/g, "$1");
    return `${cleanCode}
public class Main {
  @SuppressWarnings({"unchecked","rawtypes"})
  public static void main(String[] a) throws Exception {
    java.util.Scanner sc=new java.util.Scanner(System.in);
    java.util.List<String> lines=new java.util.ArrayList<>();
    while(sc.hasNextLine()){String l=sc.nextLine().trim();if(!l.isEmpty())lines.add(l);}
    sc.close();
    java.lang.reflect.Method m=null;
    for(java.lang.reflect.Method x:Solution.class.getDeclaredMethods()){
      int mod=x.getModifiers();
      if(java.lang.reflect.Modifier.isPublic(mod)&&java.lang.reflect.Modifier.isStatic(mod)){m=x;break;}
    }
    if(m==null){System.err.println("No public static method in Solution");return;}
    Class<?>[] pt=m.getParameterTypes();
    if(lines.size()<pt.length){System.err.println("Driver: expected "+pt.length+" arg(s), got "+lines.size()+". Check test case input.");return;}
    Object[] ca=new Object[pt.length];
    for(int i=0;i<pt.length;i++)ca[i]=parseArg(lines.get(i),pt[i]);
    Object r=m.invoke(null,ca);
    if(r!=null)System.out.println(fmt(r));
    else if(m.getReturnType()!=void.class)System.out.println("null");
  }
  static Object parseArg(String s,Class<?> t){
    s=s.trim();
    if(s.length()>=2&&s.charAt(0)=='"'&&s.charAt(s.length()-1)=='"')s=s.substring(1,s.length()-1);
    if(t==int.class||t==Integer.class)return Integer.parseInt(s);
    if(t==long.class||t==Long.class)return Long.parseLong(s);
    if(t==double.class||t==Double.class)return Double.parseDouble(s);
    if(t==boolean.class||t==Boolean.class)return Boolean.parseBoolean(s);
    if(t==String.class)return s;
    if(t==int[].class){String n=s.replace("[","").replace("]","").replace(" ","");if(n.isEmpty())return new int[0];String[]p=n.split(",");int[]arr=new int[p.length];for(int i=0;i<p.length;i++)arr[i]=Integer.parseInt(p[i].trim());return arr;}
    if(t==String[].class){String n=s.trim();if(n.startsWith("["))n=n.substring(1);if(n.endsWith("]"))n=n.substring(0,n.length()-1);if(n.isEmpty())return new String[0];String[]p=n.split(",");String[]arr=new String[p.length];for(int i=0;i<p.length;i++){String x=p[i].trim();if(x.startsWith("\\""))x=x.substring(1);if(x.endsWith("\\""))x=x.substring(0,x.length()-1);arr[i]=x;}return arr;}
    return s;
  }
  static String fmt(Object r){
    if(r instanceof int[])return java.util.Arrays.toString((int[])r).replace(", ",",");
    if(r instanceof long[])return java.util.Arrays.toString((long[])r).replace(", ",",");
    if(r instanceof boolean[])return java.util.Arrays.toString((boolean[])r).replace(", ",",");
    if(r instanceof String[])return java.util.Arrays.toString((String[])r).replace(", ",",");
    if(r instanceof java.util.List){java.util.List<?>list=(java.util.List<?>)r;StringBuilder sb=new StringBuilder("[");for(int i=0;i<list.size();i++){if(i>0)sb.append(",");Object x=list.get(i);sb.append(x instanceof String?"\\""+x+"\\"":x);}return sb.append("]").toString();}
    return String.valueOf(r);
  }
}`;
  }

  if (language === "c") {
    return `${code}\nint main(){return 0;}`;
  }

  if (language === "cpp") {
    const headers = "#include<bits/stdc++.h>\nusing namespace std;\n";
    const cppInfo = extractCppFuncInfo(code);
    if (!cppInfo) return `${headers}${code}\nint main(){return 0;}`;
    const { name, params, returnType } = cppInfo;
    const n = params.length;
    const readings = params.map((p, i) => cppReadParam(p.type, p.name, i)).join("\n  ");
    const call = `${name}(${params.map((p) => p.name).join(",")})`;
    return `${headers}${code}
int main(){
  vector<string> _lines;
  string _l;
  while(getline(cin,_l)){if(!_l.empty())_lines.push_back(_l);}
  if((int)_lines.size()<${n}){cerr<<"Driver: expected ${n} arg(s), got "<<_lines.size()<<". Check test case input."<<endl;return 1;}
  ${readings}
  ${cppPrintResult(returnType, call)}
  return 0;
}`;
  }

  const info = extractFuncInfo(code, language);
  if (!info) return code;

  const { name, paramCount } = info;

  if (language === "javascript" || language === "typescript") {
    const prefix = language === "typescript" ? "// @ts-nocheck\n" : "";
    return `${prefix}${code}
;(function(){
  var _fs=require('fs');
  var _raw=_fs.readFileSync(0,'utf8').trim();
  var _lines=_raw?_raw.replace(/\\r\\n/g,'\\n').split('\\n'):[];
  var _args;
  if(_lines.length===1){
    try{var _p=JSON.parse(_lines[0]);_args=Array.isArray(_p)?_p:[_p];}catch(_){_args=[_lines[0]];}
  }else{
    _args=_lines.map(function(l){try{return JSON.parse(l);}catch(_){return l;}});
  }
  if(_args.length<${paramCount}){process.stderr.write('Driver: expected ${paramCount} arg(s), got '+_args.length+'. Check test case input.\\n');process.exit(1);}
  var _r=${name}.apply(null,_args.slice(0,${paramCount}));
  if(_r!==undefined){console.log(typeof _r==='object'&&_r!==null?JSON.stringify(_r):String(_r));}
})();`;
  }

  if (language === "python") {
    return `${code}

import sys as _sys,json as _json
def _parse(s):
    try:return _json.loads(s)
    except Exception:return s
_raw=_sys.stdin.read().strip()
_lines=_raw.replace('\\r\\n','\\n').split('\\n') if _raw else []
if len(_lines)==1:
    try:
        _p=_json.loads(_lines[0])
        _args=list(_p) if isinstance(_p,list) else [_p]
    except Exception:_args=[_lines[0]]
else:
    _args=[_parse(l) for l in _lines]
_args=_args[:${paramCount}]
_res=${name}(*_args)
if isinstance(_res,bool):print(str(_res).lower())
elif _res is None:pass
elif isinstance(_res,(list,dict,tuple)):print(_json.dumps(_res))
else:print(_res)`;
  }

  if (language === "ruby") {
    return `${code}
require 'json'
def _parse(s); begin; JSON.parse(s); rescue; s; end; end
_raw=$stdin.read.strip
_lines=_raw.empty? ? [] : _raw.gsub("\\r\\n","\\n").split("\\n")
if _lines.length==1
  begin;_p=JSON.parse(_lines[0]);_args=_p.is_a?(Array)?_p:[_p];rescue;_args=[_lines[0]];end
else
  _args=_lines.map{|l|_parse(l)}
end
_args=_args[0,${paramCount}]
_res=${name}(*_args)
case _res
when true then puts "true"
when false then puts "false"
when nil then nil
when Array,Hash then puts _res.to_json
else puts _res.to_s
end`;
  }

  return code;
}
