/*
Copyright 2015 OpenMarket Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

'use strict';

var React = require('react');

var ChangeAvatarController = require("../../../../src/controllers/molecules/ChangeAvatar");


module.exports = React.createClass({
    displayName: 'ChangeAvatar',
    mixins: [ChangeAvatarController],

    render: function() {
        switch (this.state.phase) {
            case this.Phases.Display:
            case this.Phases.Error:
                return (
                    <div>
                        <img src={this.state.avatarUrl} />
                        <div>
                            <button>Upload new</button>
                            <button onClick={this.props.onFinished}>Cancel</button>
                        </div>
                    </div>
                );
            case this.Phases.Uploading:
                return (
                    <Loader />
                );
        }
    }
});