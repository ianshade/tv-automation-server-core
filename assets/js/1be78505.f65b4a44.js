"use strict";(self.webpackChunksofie_documentation=self.webpackChunksofie_documentation||[]).push([[9514],{8516:function(e,a,n){var r=n(7378),c=n(42),t=n.n(c),s=n(9635),i=n(353),u=n(1869);a.Z=function(e){var a=(0,r.useRef)(!1),c=(0,r.useRef)(null),o=(0,r.useState)(!1),l=o[0],h=o[1],d=(0,s.k6)(),f=(0,i.Z)(),p=f.siteConfig,b=void 0===p?{}:p,m=f.isClient,S=void 0!==m&&m,x=b.baseUrl,v=(0,u.usePluginData)("docusaurus-lunr-search"),E=function(){a.current||(Promise.all([fetch(""+x+v.fileNames.searchDoc).then((function(e){return e.json()})),fetch(""+x+v.fileNames.lunrIndex).then((function(e){return e.json()})),Promise.all([n.e(9734),n.e(6533)]).then(n.bind(n,4549)),Promise.all([n.e(532),n.e(5077)]).then(n.bind(n,5077))]).then((function(e){var a=e[0],n=e[1],r=e[2].default;0!==a.length&&(!function(e,a,n){new n({searchDocs:e,searchIndex:a,inputSelector:"#search_input_react",handleSelected:function(e,a,n){var r=x+n.url;document.createElement("a").href=r,d.push(r)}})}(a,n,r),h(!0))})),a.current=!0)},_=(0,r.useCallback)((function(a){c.current.contains(a.target)||c.current.focus(),e.handleSearchBarToggle&&e.handleSearchBarToggle(!e.isSearchBarExpanded)}),[e.isSearchBarExpanded]);return(0,r.useEffect)((function(){S&&E()}),[S]),r.createElement("div",{className:"navbar__search",key:"search-box"},r.createElement("span",{"aria-label":"expand searchbar",role:"button",className:t()("search-icon",{"search-icon-hidden":e.isSearchBarExpanded}),onClick:_,onKeyDown:_,tabIndex:0}),r.createElement("input",{id:"search_input_react",type:"search",placeholder:l?"Search":"Loading...","aria-label":"Search",className:t()("navbar__search-input",{"search-bar-expanded":e.isSearchBarExpanded},{"search-bar":!e.isSearchBarExpanded}),onClick:E,onMouseOver:E,onFocus:_,onBlur:_,ref:c,disabled:!l}))}}}]);