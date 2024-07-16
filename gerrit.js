// ==UserScript==
// @name         Gerrit Auto Review and Cherry-pick
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  Automate review and cherry-pick tasks in Gerrit
// @author       longtao.yan
// @match        https://git.i-tetris.com/c/*
// ==/UserScript==

(function() {
    'use strict';
    let reviewersKey, branchesKey;

    function initializeGlobals() {
        const changeActions = queryShadowDom(document.body, 'gr-change-actions');
        const project = changeActions.change.project;
        const keyPrefix = project.includes("cores") ? 'gerritCores' : 'gerrit';
        reviewersKey = keyPrefix + 'Reviewers';
        branchesKey = keyPrefix + 'Branches';
    }
    
    // 添加Reviewers并发送Code-Review +1
    function reviewAndAddReviewers(apiInterface,changeId, callback) {
        const reviewers = localStorage.getItem(reviewersKey).split(',')
        .map(r => r.trim())
        .filter(r => r && !r.startsWith('#')); // 过滤掉以 # 开头的reviewers

        const payload = {
            reviewers: reviewers.map(reviewer => ({ reviewer })),
            labels: {
                "Code-Review": 1
            }
        };
        apiInterface.send("POST", `https://git.i-tetris.com/a/changes/${changeId}/revisions/current/review`, payload,
                          (err) => {
            updateLogs("Failed to post review:"+err);
            if (callback) callback(err);
        },
                          "application/json",
                          {"Content-Type": "application/json"}
                         ).then(response => {
            updateLogs("Reviewers added and Code-Review +1 posted successfully.");
            if (callback) callback(null, response);
        }).catch(error => {
            updateLogs("Error in posting review:"+error);
            if (callback) callback(error);
        });
    }

    // Cherry-Pick到目标分支
    function cherryPickAndReview(apiInterface,changeId) {
        const commitMessage = queryShadowDom(document.body, '#output').textContent;
        const branches = localStorage.getItem(branchesKey).split(',')
        .map(b => b.trim())
        .filter(b => b && !b.startsWith('#')); // 过滤掉以 # 开头的branches
        const reviewers = localStorage.getItem(reviewersKey).split(',')
        .map(r => r.trim())
        .filter(r => r && !r.startsWith('#')); // 过滤掉以 # 开头的reviewers

        branches.forEach(branch => {
            const payload = JSON.stringify({
                allow_conflicts: true,
                message: commitMessage,
                destination: branch
            });

            if (apiInterface) {
                apiInterface.send(
                    "POST",
                    `https://git.i-tetris.com/a/changes/${changeId}/revisions/current/cherrypick`,
                    payload,
                    function (error) {
                        updateLogs(`Error during cherry-pick to ${branch}:`+error);
                    },
                    "application/json",
                    {"Content-Type": "application/json"}
                ).then(response => {
                    if (response.ok && response.status >= 200 && response.status < 300) {
                        response.text().then(text => {
                            // 去掉响应前缀，然后转换为JSON
                            const bodyWithoutPrefix = text.replace(/^\)\]\}'/, '');
                            const responseData = JSON.parse(bodyWithoutPrefix);
                            updateLogs(`Cherry-pick to ${branch} successfully.`);
                            const newChangeId = responseData.id;
                            reviewAndAddReviewers(apiInterface, newChangeId);
                        });
                    } else {
                        console.error(`Failed to cherry-pick to ${branch}:`+response.statusText);
                    }
                }).catch(error => {
                    console.error(`Failed to cherry-pick to ${branch}:`+ error);
                });
            }
        });
    }
    
    function queryShadowDom(root, selector) {
        // 检查当前节点是否匹配所需的选择器
        if (root.matches && root.matches(selector)) {
            return root;
        }

        // 如果当前节点有 shadowRoot，则递归搜索该 shadowRoot
        if (root.shadowRoot) {
            const result = queryShadowDom(root.shadowRoot, selector);
            if (result) {
                return result;
            }
        }

        // 同样地，遍历所有子节点
        const nodes = root.childNodes;
        for (let i = 0; i < nodes.length; i++) {
            const found = queryShadowDom(nodes[i], selector);
            if (found) {
                return found;
            }
        }

        return null;
    }



    function addButton() {
        const button = queryShadowDom(document.body,'#ReviewCP'); // 使用ID选择器定位到'primaryActions'容器
        if(button){
            console.log("Review&CP exsit");
            return
        }
        const buttonContainer = queryShadowDom(document.body,'#primaryActions'); // 使用ID选择器定位到'primaryActions'容器
        addReviewButton(buttonContainer)
        // 创建新按钮，样式和结构模仿Rebase按钮
        const newButton = document.createElement('gr-button');
        newButton.setAttribute('link', '');
        newButton.setAttribute('id', 'ReviewCP');
        newButton.setAttribute('position-below', '');
        newButton.setAttribute('data-label', 'Review&CP');
        newButton.setAttribute('data-action-type', 'customAction');
        newButton.setAttribute('data-action-key', 'reviewCherryPick');
        newButton.setAttribute('title', 'Automate review and cherry-pick tasks');
        newButton.setAttribute('role', 'button');
        newButton.setAttribute('tabindex', '0');
        newButton.textContent = '+1&CP';

        // 添加事件监听器以触发功能
        newButton.addEventListener('click', showConfigDialog);

        buttonContainer.appendChild(newButton);
    }

    function addReviewButton(buttonContainer) {
        const newButton = document.createElement('gr-button');
        newButton.setAttribute('link', '');
        newButton.setAttribute('position-below', '');
        newButton.setAttribute('data-label', 'Review');
        newButton.setAttribute('data-action-type', 'customAction');
        newButton.setAttribute('data-action-key', 'reviewCherryPick');
        newButton.setAttribute('title', 'Automate review');
        newButton.setAttribute('role', 'button');
        newButton.setAttribute('tabindex', '0');
        newButton.textContent = '+1';

        // 添加事件监听器以触发功能
        newButton.addEventListener('click', function() {
            const changeId = queryShadowDom(document.body,'gr-change-actions').change.id;
            console.log("changeId:"+changeId);
            const apiInterface = queryShadowDom(document.body,'gr-rest-api-interface');
            reviewAndAddReviewers(apiInterface,changeId, function(err, response) {
                window.location.reload();
            });
        });

        buttonContainer.appendChild(newButton);
    }

    function showConfigDialog() {
        const dialogHtml = `
    <div id="configDialog" style="position: fixed; top: 10vh; left: 50%; transform: translateX(-50%); width: 350px; background-color: white; padding: 20px; border-radius: 10px; box-shadow: 0 4px 8px rgba(0,0,0,0.3); z-index: 1000;">
        <div style="margin-bottom: 20px;">
            <label for="reviewersInput" style="display: block; font-weight: bold; margin-bottom: 5px;">Reviewers (comma separated):</label>
            <textarea id="reviewersInput" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; min-height: 100px; resize: vertical;">${localStorage.getItem(reviewersKey) || ''}</textarea>
        </div>
        <div style="margin-bottom: 20px;">
            <label for="branchesInput" style="display: block; font-weight: bold; margin-bottom: 5px;">Target Branches (comma separated):</label>
            <textarea id="branchesInput" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; min-height: 100px; resize: vertical;">${localStorage.getItem(branchesKey) || ''}</textarea>
        </div>
        <button id="saveConfigButton" style="padding: 8px 15px; background-color: #007bff; color: white; border: none; border-radius: 4px; margin-right: 10px; cursor: pointer;">Save & Start</button>
        <button id="cancelConfigButton" style="padding: 8px 15px; background-color: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">Cancel</button>
    </div>
    `;
        document.body.insertAdjacentHTML('beforeend', dialogHtml);
        document.getElementById('saveConfigButton').addEventListener('click', saveConfig);
        document.getElementById('cancelConfigButton').addEventListener('click', function() {
            document.getElementById('configDialog').remove();
        });
    }

    function showLogDialog() {
        const logDialogHtml = `
    <div id="logDialog" style="position: fixed; top: 20%; left: 50%; transform: translateX(-50%); width: 400px; background-color: white; padding: 20px; border-radius: 10px; box-shadow: 0 4px 8px rgba(0,0,0,0.3); z-index: 1000;">
        <h4 style="margin-bottom: 20px;">Operation Logs</h4>
        <div id="logs" style="height: 200px; overflow-y: auto; background-color: #f8f9fa; padding: 10px; border: 1px solid #ccc; margin-bottom: 20px;"></div>
        <button onclick="document.getElementById('logDialog').remove();" style="padding: 8px 15px; background-color: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">Close</button>
    </div>
    `;
        document.body.insertAdjacentHTML('beforeend', logDialogHtml);
        updateLogs("Starting review and cherry-pick operations...");
    }


    function updateLogs(message) {
        const logsElement = document.getElementById('logs');
        if (logsElement) {
            logsElement.innerHTML += `<p>${message}</p>`;
            logsElement.scrollTop = logsElement.scrollHeight;
        }
    }

    function saveConfig() {
        const reviewers = document.getElementById('reviewersInput').value;
        const branches = document.getElementById('branchesInput').value;
        localStorage.setItem(reviewersKey, reviewers);
        localStorage.setItem(branchesKey, branches);
        document.getElementById('configDialog').remove();
        showLogDialog(); // 显示日志对话框
        startReviewAndCherryPick(); // 保存配置后执行 Review 和 Cherry-pick
    }

    function startReviewAndCherryPick() {
        const changeId = queryShadowDom(document.body, 'gr-change-actions').change.id;
        const apiInterface = queryShadowDom(document.body, 'gr-rest-api-interface');
        reviewAndAddReviewers(apiInterface, changeId);
        cherryPickAndReview(apiInterface, changeId);
    }

    // 创建一个观察器实例并传入回调函数
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            addButton(); // 每次DOM变化尝试添加按钮
        });
    });

    // 配置观察器选项，例如观察子节点、属性变化等
    const config = { childList: true, subtree: true };

    // 选择需要观察变化的节点
    const targetNode = document.body;

    // 使用配置开始观察目标节点
    observer.observe(targetNode, config);

    // 在页面加载完成后添加按钮
    window.addEventListener('load', addButton);
})();
