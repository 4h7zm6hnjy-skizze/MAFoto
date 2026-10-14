"""MAFoto Chromium-only integration test using a simulated camera stream.
Real iOS Safari camera performance cannot be tested in Chromium.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import base64

ROOT=Path(__file__).resolve().parents[1]
errors=[]
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
    context=browser.new_context(viewport={'width':393,'height':852},device_scale_factor=2,is_mobile=True,has_touch=True,accept_downloads=True)
    page=context.new_page()
    page.evaluate('''(() => {
      const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=960;
      const c=canvas.getContext('2d');let tick=0;
      setInterval(()=>{tick++;
        c.fillStyle='#203a51';c.fillRect(0,0,1280,960);
        c.fillStyle='#d6e8f0';c.fillRect(0,620,1280,340);
        c.fillStyle='#e2ba68';c.fillRect(150,110,365,470);
        c.fillStyle='#faf8c0';c.fillRect(570+tick%430,220,25,25);
      },50);
      Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{
        getUserMedia:async({video,audio})=>{if(audio)throw Error('Unexpected mic access'); if(!video)throw Error('Video stream required for live camera');return canvas.captureStream(25);},
        enumerateDevices:async()=>[{kind:'videoinput',deviceId:'cam-1',label:'Simulierte Kamera'}]
      }});
      const maps={metadata:new Map(),media:new Map()};
      const db={objectStoreNames:{contains:n=>Boolean(maps[n])},createObjectStore:n=>{maps[n]=new Map()},transaction:()=>{
        let timer;const tx={objectStore:name=>({
          put:v=>{maps[name].set(v.id,v);clearTimeout(timer);timer=setTimeout(()=>tx.oncomplete?.(),4)},
          delete:id=>{maps[name].delete(id);clearTimeout(timer);timer=setTimeout(()=>tx.oncomplete?.(),4)},
          getAll:()=>{const q={};setTimeout(()=>{q.result=[...maps[name].values()];q.onsuccess?.()},4);return q},
          get:id=>{const q={};setTimeout(()=>{q.result=maps[name].get(id);q.onsuccess?.()},4);return q}
        })};return tx;
      }};
      Object.defineProperty(window,'indexedDB',{configurable:true,value:{open:()=>{const q={};setTimeout(()=>{q.result=db;q.onsuccess?.()},5);return q}}});
      Object.defineProperty(navigator,'wakeLock',{configurable:true,value:{request:async()=>({release:async()=>{}})}});
    })();''')
    page.on('pageerror',lambda err: errors.append(str(err)))
    html=(ROOT/'index.html').read_text()
    css=(ROOT/'styles.css').read_text()
    js=(ROOT/'app.js').read_text()
    logo_data=base64.b64encode((ROOT/'assets/MAFoto-Logo.png').read_bytes()).decode()
    html=html.replace('src="./assets/MAFoto-Logo.png"',f'src="data:image/png;base64,{logo_data}"')
    html=html.replace('<link rel="stylesheet" href="./styles.css">',f'<style>{css}</style>')
    html=html.replace('<script src="./imaging.js" defer></script>',f'<script>{(ROOT/"imaging.js").read_text()}</script>')
    html=html.replace('<script src="./app.js" defer></script>',f'<script>{js}</script>')
    page.set_content(html,wait_until='domcontentloaded')
    page.wait_for_function("document.querySelector('#startCameraBtn') && !document.querySelector('#app').classList.contains('error')")
    assert page.title().startswith('MAFoto')
    assert page.locator('.brand-logo').count()==1
    assert page.locator('.brand-logo').evaluate('(el)=>el.complete && el.naturalWidth>0')
    assert page.locator('[data-mode=video]').count()==0
    assert page.locator('#ratioLabel').inner_text()=='16:9'
    assert page.locator('#ratioBtn').is_disabled()
    page.screenshot(path='/mnt/data/MAFoto_16zu9_Start.png',full_page=True)
    page.locator('#startCameraBtn').click()
    page.wait_for_function("document.querySelector('#noCamera').classList.contains('hidden')&&document.querySelector('#preview').videoWidth>0",timeout=15000)
    page.screenshot(path='/mnt/data/MAFoto_16zu9_Kamera.png',full_page=True)
    page.locator('#shutterBtn').click()
    page.wait_for_function("document.querySelector('#galleryCount').textContent==='1'",timeout=15000)
    page.locator('#galleryBtn').click()
    page.locator('.gallery-item').first.click()
    page.wait_for_selector('#detailMedia img',timeout=12000)
    firstdims=page.locator('#detailMedia img').evaluate('(el)=>({width:el.naturalWidth,height:el.naturalHeight})')
    assert firstdims['width']*16 == firstdims['height']*9, firstdims
    print('PORTRAIT PHOTO:',firstdims)
    page.locator('#detailSheet [data-close]').click()
    page.locator('#gallerySheet [data-close]').click()
    page.set_viewport_size({'width':852,'height':393})
    page.wait_for_timeout(400)
    page.locator('#shutterBtn').click()
    page.wait_for_function("document.querySelector('#galleryCount').textContent==='2'",timeout=15000)
    page.locator('#galleryBtn').click()
    page.locator('.gallery-item').first.click()
    page.wait_for_selector('#detailMedia img',timeout=12000)
    seconddims=page.locator('#detailMedia img').evaluate('(el)=>({width:el.naturalWidth,height:el.naturalHeight})')
    assert seconddims['width']*9 == seconddims['height']*16,seconddims
    print('LANDSCAPE PHOTO:',seconddims)
    page.locator('#detailSheet [data-close]').click()
    page.locator('#gallerySheet [data-close]').click()
    page.set_viewport_size({'width':393,'height':852})
    page.locator('[data-mode=long]').click()
    assert page.locator('#longPanel').is_visible()
    page.locator('#longDuration').select_option('300')
    assert page.locator('#longSecondsLabel').inner_text()=='05:00'
    page.locator('#longSeconds').fill('2')
    assert page.locator('#longDuration').input_value()=='custom'
    for effect,number in [('trails','3'),('silky','4'),('night','5')]:
      page.locator(f'[data-effect={effect}]').click()
      page.locator('#shutterBtn').click()
      page.wait_for_function("!document.querySelector('#app').classList.contains('exposing')",timeout=18000)
      page.wait_for_function(f"document.querySelector('#galleryCount').textContent==='{number}'",timeout=18000)
      page.locator('#galleryBtn').click()
      page.locator('.gallery-item').first.click()
      page.wait_for_selector('#detailMedia img',timeout=15000)
      imgdims=page.locator('#detailMedia img').evaluate('(el)=>({width:el.naturalWidth,height:el.naturalHeight})')
      assert imgdims['width']*16==imgdims['height']*9,imgdims
      assert 'Software-Langzeit' in page.locator('#detailMetadata').inner_text()
      print('LONG:',effect,imgdims)
      page.locator('#detailSheet [data-close]').click()
      page.locator('#gallerySheet [data-close]').click()
    page.locator('#longDuration').select_option('300')
    page.locator('#shutterBtn').click()
    page.wait_for_function("parseInt(document.querySelector('#longFrameCount').textContent)>=2",timeout=12000)
    page.locator('#stopLongBtn').click()
    page.wait_for_function("!document.querySelector('#app').classList.contains('exposing')",timeout=15000)
    page.wait_for_function("document.querySelector('#galleryCount').textContent==='6'",timeout=12000)
    page.locator('#settingsBtn').click()
    assert '1.0.0' in page.locator('#settingsSheet .eyebrow').inner_text()
    assert page.locator('#stackQuality option[value="0"]').count()==1
    print('CHROMIUM ERRORS:',errors)
    assert not errors,errors
    browser.close()

print('ALL CHECKS PASS')
