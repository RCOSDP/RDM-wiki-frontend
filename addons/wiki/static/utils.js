'use strict';

function isParent(node) {
    return !!(node && node.children && Array.isArray(node.children));
  }
  
export function isLiteral(node) {
    return !!(node && typeof node.value === 'string');
  }

export function flatMap(ast, fn) {
    return transform(ast, 0, null)[0];

    function transform(node, index, parent) {
        if (isParent(node)) {
            const out = [];
            //#51315 Add Start 訂正線とコードブロック対応
            for (var i = 0 ; i < node.children.length ; i++) {
                if (node.children[i] && node.children[i].type === 'text' && node.children[i].value.match(/.*\~\~.*$/)) {
                    // 取り消し線が設定済みの場合
                    node.children = deleteChange(node);
                    break;
                }
            }
            //#51315 Add End 訂正線とコードブロック対応
            for (var sCnt = 0 ; sCnt < node.children.length ; sCnt++) {
                //#48569 Add Start 子アンカー対応
                if (node.children[sCnt] && node.children[sCnt].type === 'link') {

                    // URLにアンカーが存在する場合
                    if(window.location.hash){
                        node.children[sCnt].url = node.children[sCnt].url.replace('\.\.\/','\.\/');
                    }
                }
                //#48569 Add End 子アンカー対応
                //#54471 バックスラッシュ付きのリンクについては、マークダウン内でエスケープされているため、表示する際に、エスケープ用のバックスラッシュを非表示にする
                if (node.children[sCnt].type === 'link' && node.children[sCnt].url && node.children[sCnt].url.match(/.*\\.*$/)) {
                    node.children[sCnt].url = node.children[sCnt].url.replaceAll('\\','');
                    if(node.children[sCnt].children[0] && node.children[sCnt].children[0].value){
                        node.children[sCnt].children[0].value = node.children[sCnt].children[0].value.replaceAll('\\','');
                    }
                }
                //#51297 Add Start 下線文字色対応
                if (node.children[sCnt] && node.children[sCnt].type === 'text' ) {
                    // #56408 表示できないページの対応 Mod Start
                    //if(/\*</.test(node.children[sCnt].value)) {
                    if(/\*<span/.test(node.children[sCnt].value) || /\*<u/.test(node.children[sCnt].value )) {
                    // #56408 表示できないページの対応 Mod End
                        // 太文字かイタリックが存在した場合（下線or文字色と同時の場合のみ）
                        subTransFormStrong(node,sCnt);
                    }
                    const indexULine = node.children[sCnt].value.indexOf('<u>');
                    const indexColor = node.children[sCnt].value.indexOf('<span style=\"color\:');
                    if(indexULine >= 0 && indexColor >=0){
                        // どちらも存在した場合
                        if(indexULine < indexColor){
                            // 下線の方が先
                            subTransForm(node,'u',sCnt);
                        }else{
                            // 文字色の方が先
                            subTransForm(node, 'span',sCnt);
                        }
                    // 下線の場合
                    }else if(/<u>/.test(node.children[sCnt].value)) {
                        subTransForm(node,'u',sCnt);
                    // 文字色の場合
                    }else if (/<span style=\"color\:/.test(node.children[sCnt].value)) {
                        subTransForm(node, 'span',sCnt);
                    }
                }
            }
            //#47039 Add End 下線文字色対応
            for (var uLineCnt = 0, n = node.children.length; uLineCnt < n; uLineCnt++) {
                const nthChild = node.children[uLineCnt];
                if (nthChild) {
                    if (nthChild.type === 'text' && /.*!\[.*\]\($/.test(nthChild.value) ) {
                        const remainingChildren = getRemainingNode(uLineCnt, node.children);
                        const transformedChildren = transformImageSection(remainingChildren);
                        out.push(...transformedChildren);
                        break;
                    //#49455 Add Start リンク付き画像対応
                    }else if (nthChild.type === 'text' && /.*!\[.*\]\(.*$/.test(nthChild.value) ) {
                        const remainingChildren = getRemainingNode(uLineCnt, node.children);
                        const transformedChildren = transformImageSection(remainingChildren);
                        out.push(...transformedChildren);
                        break;
                    //#49455 Add End リンク付き画像対応
                    } else if (nthChild.type === 'text' && /@\[osf\]\(/.test(nthChild.value)) {
                        // Handle @[osf](GUID) format
                        const transformed = transformOsfImage(nthChild);
                        if (transformed && transformed.length > 0) {
                            out.push(...transformed);
                        } else {
                            addTransformedChildren(nthChild, uLineCnt, node, out);
                        }
                    } else {
                        addTransformedChildren(nthChild, uLineCnt, node, out);
                    }
                }
            }
            node.children = out;
        }
        return fn(node, index, parent);
    }

    function addTransformedChildren(nthChild, i, node, out) {
        const xs = transform(nthChild, i, node);
        if (xs) {
            for (var j = 0, m = xs.length; j < m; j++) {
                const item = xs[j];
                if (item) out.push(item);
            }
        }
    }

  function transformOsfImage(textNode) {
      // @[osf](GUID) のパターン
      const osfImagePattern = /@\[osf\]\(([a-zA-Z0-9]{5,})\)/g;
      const text = textNode.value;
      const matches = [];
      let lastIndex = 0;
      let match;

      while ((match = osfImagePattern.exec(text)) !== null) {
        if (match.index > lastIndex) {
            matches.push({ type: 'text', value: text.substring(lastIndex, match.index) });
        }

        // @[osf](GUID)からURLを作る
        const guid = match[1];
        const osfURL = window.contextVars && window.contextVars.osfURL ? window.contextVars.osfURL : '';
        let imageUrl = osfURL + guid + '/?action=download&mode=render';

        const $osfHelper = (typeof window !== 'undefined' && window.$osf && typeof window.$osf.urlParams === 'function') ? window.$osf : null;

        if ($osfHelper && $osfHelper.urlParams && $osfHelper.urlParams().view_only) {
            imageUrl += '&view_only=' + $osfHelper.urlParams().view_only;
        }

        matches.push({
            type: 'image',
            alt: guid,
            url: imageUrl
        });

        lastIndex = osfImagePattern.lastIndex;
    }

    // Add remaining text after the last match
    if (lastIndex < text.length) {
        matches.push({ type: 'text', value: text.substring(lastIndex) });
    }

      return matches.length > 0 ? matches : null;
  }

  function transformImageSection(remainingChildren) {
      const result = [];
      for (var i = 0; i < remainingChildren.length; i++) {
          if (remainingChildren[i].type === 'text' && /!\[.*\]\($/.test(remainingChildren[i].value)) {
              const imageNode = createImageNode(remainingChildren[i], remainingChildren[i + 1], remainingChildren[i + 2]);
              if (imageNode) {
                  result.push(imageNode);
                  i += 2;
              } else {
                result.push(remainingChildren[i]);
            }
          } else {
              result.push(remainingChildren[i]);
          }
      }
      return result;
  }

  function getRemainingNode(startIdx, nodeChildren) {
        var remainingChildren = [];
        for (var i = startIdx; i < nodeChildren.length; i++) {
            if (nodeChildren[i].type === 'text') {
                if (nodeChildren[i].value.match(/.*!\[.*\]\($/)) {
                    const matchBeforeImage = nodeChildren[i].value.match(/^(.*?)(!\[.*\]\()$/);
                    if (matchBeforeImage[1] !== '') {
                        const beforeImage = matchBeforeImage[1];
                        const matchSize = beforeImage.match(/^(\s*=\d+\))(.*)$/);
                        if (matchSize) {
                            if (matchSize[1] !== '') {
                                remainingChildren.push({ type: 'text', value: matchSize[1] });
                            }
                            if (matchSize[2] !== '') {
                                remainingChildren.push({ type: 'text', value: matchSize[2] });
                            }
                        } else {
                            remainingChildren.push({ type: 'text', value: beforeImage });
                        }
                    }
                    remainingChildren.push({ type: 'text', value: matchBeforeImage[2] });
                    continue;
                } else if (nodeChildren[i].value.match(/^(\s*=\d+\))(.*)/)) {
                    const match = nodeChildren[i].value.match(/^(\s*=\d+\))(.*)/);
                    if (match) {
                        if (match[1] !== '') {
                            remainingChildren.push({ type: 'text', value: match[1] });
                        }
                        if (match[2] !== '') {
                            remainingChildren.push({ type: 'text', value: match[2] });
                        }
                    }
                    continue;
//#49455 Add Start リンク付き画像対応
                }else if (nodeChildren[i].value.match(/!\[\]\(.*\)$/)) {
                    const matchBeforeImage = nodeChildren[i].value.match(/(.*=.*)/);
                    if (matchBeforeImage[0] !== '') {
                        const beforeImage = matchBeforeImage[0];
                        const imageUrl = beforeImage.replace('\!\[\]\(','').replace('\)','');
                        if (imageUrl) {
                            remainingChildren.push({type: 'image', url: imageUrl, title: null, alt: ''});
                        }
                    }
                    continue;
                }
//#49455 Add End リンク付き画像対応
            }
            remainingChildren.push(nodeChildren[i]);
        }
        return remainingChildren;
    }

    //#47039 Add Start 下線文字色対応
    // 文字色と下線の処理
    function subTransForm(node, tagText, startCnt){
        var textChildren = [];  // 戻りの配列

        var textStartChildren = [];  // 最初の文字列の配列

        // 文字列を分解する
        startCnt = splitTags(node,startCnt);

        // 以前のデータも詰め込む
        if(startCnt > 0){
            textStartChildren = node.children.slice(0,startCnt);
        }
        var endCnt = startCnt;
        var endTag = '<\/' + tagText + '>';
        for(var i = startCnt ; i < node.children.length ; i++) {
            if(tagText === 'span'){
                if(node.children[i].type === 'text' && /<\/span>/.test(node.children[i].value)) {
                    // 終わりのタグ位置を調べる
                    endCnt = i;
                    break;
                } 
            }else if(tagText === 'u'){
                if(node.children[i].type === 'text' && /<\/u>/.test(node.children[i].value)) {
                    // 終わりのタグ位置を調べる
                    endCnt = i;
                    break;
                } 
            }
    
        }
        if(endCnt !== node.children.length) {
            var retrunNode =[];  // 戻り値
            var openTags  = '';  // 開始タグの前
            var closeTags = '';  // 終了タグの前
            if(tagText ===  'u'){
                // 下線の場合
                retrunNode = { type: 'underline' };
                openTags = node.children[startCnt].value.replace(/<u>/, '');
            }else if(tagText === 'span'){
                // 文字色の場合
                var colorNameOrg = node.children[startCnt].value.replace(/<span style=\"color:/, '').replace(/\">.*/, '');
                var colorName = colorNameOrg.trimStart();
                if(/.*<\/span>/.test(colorName)){
                    colorName = colorName.replace(/\".*<\/span>/, '');
                }
                retrunNode = { type: 'colortext' ,color : colorName};
                openTags = node.children[startCnt].value.replace('<span style=\"color:' + colorNameOrg + '\">', '');
            }

            // 終了タグがある文字列を分割する
            splitTags(node,endCnt);
            // 再度終了タグの場所を探す
            for(var nextEnd = startCnt ; nextEnd < node.children.length ; nextEnd++) {
                if(tagText === 'span'){
                    if(node.children[nextEnd].type === 'text' && /<\/span>/.test(node.children[nextEnd].value)) {
                        // 終わりのタグ位置を調べる
                        endCnt = nextEnd;
                        break;
                    } 
                }else if(tagText === 'u'){
                    if(node.children[nextEnd].type === 'text' && /<\/u>/.test(node.children[nextEnd].value)) {
                        // 終わりのタグ位置を調べる
                        endCnt = nextEnd;
                        break;
                    } 
                } 
            }
            // クローズタグを消した値を設定する
            closeTags = node.children[endCnt].value.replace(endTag, '');

            var remainingChildren = [];
            if (endCnt === startCnt){
                // 同一ノード内にOpenとCloseがある場合
                var openCloseTag = openTags.replace(endTag, '');
                if (openTags.length > 0) {
                    remainingChildren.push({ type: 'text', value: openCloseTag});
                }
            }else{
                if (openTags.length > 0) {
                    remainingChildren.push({ type: 'text', value: openTags});
                }
                remainingChildren = remainingChildren.concat(node.children.slice(startCnt + 1, endCnt));
                if (closeTags.length > 0) {
                    remainingChildren.push({ type: 'text', value: closeTags});
                }
            }
            //ノードを詰め込む
            const out = [];
            for (var cldLen = 0, n = remainingChildren.length; cldLen < n; cldLen++) {
                const nthChild = remainingChildren[cldLen];
                if (nthChild) {
                    addTransformedChildren(nthChild, cldLen, node, out);
                }
            }
            retrunNode.children = out;

            if(textStartChildren !== ''){
                textChildren = textStartChildren.concat(retrunNode);
            }else{
                textChildren = retrunNode;
            }

            // 以降のデータも詰め込む
            if(endCnt < node.children.length-1){
                var tailNode =[];
                tailNode.children = node.children.slice(endCnt+1);
                const xs2 = transform(tailNode, 0, textChildren);
                textChildren = textChildren.concat(xs2[0].children);
            }
            node.children = textChildren;
        }
    }

    // 太文字とイタリックの変換修正対応
    function subTransFormStrong(node,startCnt){
        var remainingChildren = [];
        var remainingChildren2 = [];
        // #56408 ページが表示できない件の対応 Mod Start
        //var frontStr = node.children[startCnt].value.replace(/\*{1,3}<.*/,'');       // アスタリスク前
        // 開始位置を把握
        var frontStr = '';
        if(/\*<span/.test(node.children[startCnt].value)){
            frontStr = node.children[startCnt].value.replace(/\*{1,3}<span.*/,'');
        }else if(/\*<u/.test(node.children[startCnt].value )) {
            frontStr = node.children[startCnt].value.replace(/\*{1,3}<u.*/,'');
        }else{
            return;
        }
        // #56408 ページが表示できない件の対応 Mod End
        var endCnt = startCnt;
        var strChildren = [];
        // 終わりの場所を調べる
        for(var i=startCnt ; i<node.children.length ; i++){
            // #56408 ページが表示できない件の対応 Mod Start
            //if(node.children[i].value && (node.children[i].value.match(/.*\>\*{1,3}/) || []).length === 1){
            const v = node.children[i].value;
            if (v && (/.*\u>\*{1,3}/.test(v) || /.*\span>\*{1,3}/.test(v))) {
                // #56408 ページが表示できない件の対応 Mod End
                endCnt = i;
                break;
            }
        }
        var tailStr = node.children[endCnt].value.replace(/.*\>\*{1,3}/,'');   // アスタリスク後
        if(endCnt >= 1 ){
            for(var tailCnt=1 ; tailCnt<endCnt ; tailCnt++){
                strChildren.push(node.children[tailCnt]);
            }
        }else{
            var str = node.children[startCnt].value.replace(frontStr,'').replace(tailStr,'').replace(/\*/g,''); // アスタリスクの中
            strChildren.push({type: 'text', value: str});
        }

        if(strChildren){
            remainingChildren.push({type: 'text' , value: frontStr});
            if((node.children[startCnt].value.match(/\*\*\*</g) || []).length === 1){
                //太文字とイタリックがある
                var stEmpChildren =[];
                stEmpChildren = ({ type: 'strong' });
                stEmpChildren.children = strChildren;
                remainingChildren2 = ({ type: 'emphasis' });
                remainingChildren2.children = [stEmpChildren];
            }else if((node.children[startCnt].value.match(/\*\*</g) || []).length === 1){
                //太文字だけある
                remainingChildren2 = ({ type: 'strong'});
                remainingChildren2.children = strChildren;
            }else if((node.children[startCnt].value.match(/\*</g) || []).length === 1){
                //イタリックがある
                remainingChildren2 = ({ type: 'emphasis'});
                remainingChildren2.children = strChildren;
            }else{
                //何もない
                return;
            }
            if(remainingChildren2 !== ''){
                remainingChildren.push(remainingChildren2);
            }
            remainingChildren.push({type: 'text' , value: tailStr});

            // ノードの２番目に挿入
            node.children.splice( 0, endCnt+1 );        // 変換したノードを削除
            Array.prototype.splice.apply(node.children,[1,0].concat(remainingChildren));    //　ノードを追加
        }
    }

    // 文字分割処理
    function splitTags(node, spritCnt){
        var tmpNode = [];
        var tmpText = '';
        var itemData = node.children[spritCnt].value.split('<');    // 文字列分割

        for(var j=0 ; j < itemData.length ; j++){
            if(itemData[j].startsWith('span style')){
                tmpText = '<' + itemData[j];
                tmpNode.push({type: 'text' ,value : tmpText});
                tmpText = '';
            }else if(itemData[j].startsWith('u>')){
                tmpText = '<' + itemData[j];
                tmpNode.push({type: 'text' ,value : tmpText});
                tmpText = '';
            }else if(itemData[j].startsWith('\/span>')){
                tmpText = tmpText + '<\/span>';
                tmpNode.push({type: 'text' ,value : tmpText});
                if(itemData[j] !== '\/span>'){
                    // 終了タグだけではない場合、終了タグを取り除いた値を設定
                    tmpNode.push({type: 'text' ,value : itemData[j].replace('\/span>','')});
                }
                tmpText = '';
            }else if(itemData[j].startsWith('\/u>')){
                tmpText = tmpText + '<\/u>';
                tmpNode.push({type: 'text' ,value : tmpText});
                if(itemData[j] !== '\/u>'){
                    // 終了タグだけではない場合、終了タグを取り除いた値を設定
                    tmpNode.push({type: 'text' ,value : itemData[j].replace('\/u>','')});
                }
                tmpText = '';
            // #54864 開始タグと終了タグのみだった場合の対応
            }else if(itemData[j] !== '' && itemData[j].startsWith('\>')){
                tmpText = '<' + itemData[j];
                // #56280 blockquoteと文字装飾の対応
                if(tmpText.startsWith('<>')){
                    tmpText = itemData[j];
                }
                // #56280 blockquoteと文字装飾の対応
                tmpNode.push({type: 'text' ,value : tmpText});
                tmpText = '';
            // #54864 開始タグと終了タグのみだった場合の対応
            }else if(itemData[j] !== '' && tmpText === ''){
                tmpNode.push({type: 'text' ,value : itemData[j]});
            }else if(itemData[j] !== '' && tmpText !== ''){
                tmpText = tmpText + itemData[j];
            }
        }
        // 残りのノードを詰め込む
        if(tmpText !== '' ){
            tmpNode.push({type: 'text' ,value : tmpText});
        }

        if(!(tmpNode[0].value.startsWith('<'))){
            //最初が文字の場合はそのまま設定
            node.children[spritCnt].value = tmpNode[0].value;
            // 詰め込んだ先頭ノードを削除
            tmpNode.shift();
            Array.prototype.splice.apply(node.children,[spritCnt + 1,0].concat(tmpNode));
            spritCnt = spritCnt + 1;
        }else if(tmpNode[0].value.startsWith('<span') || tmpNode[0].value.startsWith('<u')){
            // 開始タグの場合、ノードを付け替える
            Array.prototype.splice.apply(node.children,[spritCnt + 1,0].concat(tmpNode));
            node.children.splice(spritCnt,1);
        }else if(tmpNode[0].value.startsWith('<\/span') || tmpNode[0].value.startsWith('<\/u')){
            // 終了タグの場合、配列の途中に設定
            Array.prototype.splice.apply(node.children,[spritCnt + 1,0].concat(tmpNode));
            // 分解した配列を削除する
            node.children.splice(spritCnt,1);
        }
        return spritCnt;
    }
    //#47039 Add End 下線文字色対応

    //#51315 Add Start 訂正線とコードブロック対応
    function deleteChange(node){
        var startCnt = 0;
        var endCnt = 0;
        var tmpNode = [];
        var tmpNodeCh = [];
        var tmpText = '';

        for(var i = 0 ; i < node.children.length ; i++) {
            // 最初に見つかった取り消し線開始の場所を探す
            for (var j = startCnt ; j < node.children.length ; j++) {
                if (node.children[j] && node.children[j].type === 'text' && node.children[j].value.match((/.*\~\~.*$/))) {
                    // 取り消し線が設定済みの場合
                    startCnt = j;
                    var tmpSText = node.children[j].value.substring(0,node.children[j].value.indexOf('\~\~'));
                    if(tmpSText !== ''){
                        tmpNode.push({type: 'text', value:tmpSText});
                        node.children[j].value = node.children[j].value.replace(tmpSText+'\~\~','');
                        if(!(node.children[j].value.match(/.*\~\~.*$/))){
                            startCnt = startCnt + 1;
                        }
                    }else if(node.children[j].value.match(/\~\~.*$/)){
                        //先頭から始まっていたら
                        node.children[j].value = node.children[j].value.replace('\~\~','');
                        if(!(node.children[j].value.match(/.*\~\~.*$/))){
                            startCnt = startCnt + 1;
                        }
                    }
                    var tmpEText = node.children[j].value.replace(tmpSText,'').replace('\~\~','');
                    if(tmpEText !== ''){
                        tmpNodeCh.push({type: 'text', value:tmpEText});
                    }
                    tmpNode.push({type: 'delete'});
                    break;
                }
                tmpNode.push(node.children[j]);
            }

            // 最初に見つかった終わりの場所を探す
            for (var sCnt = startCnt ; sCnt < node.children.length ; sCnt++) {
                if (node.children[sCnt] && node.children[sCnt].type === 'text' && node.children[sCnt].value.match((/.*\~\~.*$/))) {
                    // 取り消し線が設定済みの場合
                    endCnt = sCnt;
                    tmpText = node.children[sCnt].value.replace('\~\~','');
                    if(!(node.children[sCnt].value.endsWith('\~\~'))){
                        // 最後が終了タグで終わっていなかったら
                        tmpNode.push({type: 'text', value:tmpText});
                    }
                    break;
                }
                tmpNodeCh.push(node.children[sCnt]);
            }
            tmpNode[startCnt].children = tmpNodeCh;
            if(i < endCnt){
                i = endCnt;
            }
            startCnt = endCnt + 1;
        }
        return tmpNode;
    }
    // #51315 Add End 訂正線とコードブロック対応
}

function createImageNode(altNode, linkNode, sizeNode) {
    const altTextMatch = altNode.value.match(/^!\[(.*)\]\($/);
    const imageNode = { type: 'image', alt: altTextMatch ? altTextMatch[1] : '', url: '' };

    if (linkNode && linkNode.type === 'link') {
        imageNode.url = linkNode.url;
    }

    if (sizeNode && sizeNode.type === 'text' && /^\s*=\d+%?(x\d*%?)?\)?\s*$/.test(sizeNode.value)) {
        const sizeValue = sizeNode.value.replace(/\)$/, '');
        imageNode.url += sizeValue;
    } else {
        return null;
    }

    return imageNode;
}

