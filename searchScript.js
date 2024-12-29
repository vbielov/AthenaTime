const inputField = document.getElementById("search");
const searchButton = document.getElementById("searchButton");
inputField.focus();

async function searchDuck(query) {

}

function search() {
    const search = inputField.value;
    searchDuck(search);
};

inputField.addEventListener("keyup", function(e) {
    if(e.key === "Enter") {
        search();
    }
});

searchButton.addEventListener("click", function() {
    search();
});
