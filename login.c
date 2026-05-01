#include<stdio.h>
#include<string.h>
#include<stdlib.h>

int user_choice();
void user_input();
void user_register();
int username_check();
int user_login_check();
void login_output(int status);


char user_filename[] = "files/user.txt";
char user_name[40], password[8];
int choice, status=0;


int main() {

    while (1) {
        choice = user_choice();

        if (choice==1) {
            user_input();
            if (username_check()) {
                user_register();
                printf("Registration Successful!!\n\n");
            }
            else {
                printf("Username Already Exists. Try using another User name.\n");
            }
        }

        else if (choice==2) {
            user_input();
            login_output(user_login_check());
        }

        else if (choice==3) {
            printf("Thanks for visiting!!");
            break;
        }

        else {
            printf("Invalid Choice\n\n");
        }
    }
    return 0;
}

int user_choice() {
    printf("\n1. Register your Company/Organistaion\n");
    printf("2. Log-In\n");
    printf("3. Exit\n");
    printf("Choice: ");
    scanf("%d", &choice);
    printf("\n");
    return choice;
}

void user_input() {
    int valid_email = 0;
    while(valid_email != 1) {
        printf("Enter user name: ");
        scanf(" %s", user_name);
        for (int i = 0; user_name[i] != '\0' ; i++) {
            if (user_name[i] == '@') {
                valid_email++;
            }
        }
        if (valid_email == 1) {
            continue;
        }
        printf("Invalid E-mail\n");
        printf("Try again\n");
        valid_email = 0;
    }
    printf("Enter Password: ");
    scanf("%s", password);
    printf("\n");
}

void user_register() {
    FILE *fptr;

    fptr = fopen(user_filename, "a");
    fprintf(fptr, "%s", user_name);
    fputc(' ', fptr);
    fprintf(fptr, "%s", password);
    fputc('\n', fptr);
    fclose(fptr);
}

int username_check() {
    int user_exist = 1;

    FILE *fptr;

    fptr = fopen(user_filename, "r");
    rewind(fptr);
    
    char username[20], password1[8];

    while(fscanf(fptr, "%s %s", username, password1) == 2) {

        if (strcmp(username, user_name) == 0) {
            user_exist = 0; 
            break;
        }
    }

    fclose(fptr);
    return user_exist;
}

int user_login_check() {
    int status=0;
    FILE *fptr;

    fptr = fopen(user_filename, "r");
    rewind(fptr);
    
    char username[20], password1[8];

    while(fscanf(fptr, "%s %s", username, password1) == 2) {
        if (strcmp(username, user_name) == 0) {
            if (strcmp(password1, password) == 0) {
                status++; 
                break;
            }
        }
    }

    fclose(fptr);
    return status;
}

void login_output(int status) {
    if (status == 1) {
        printf("Username & Password is correct.\nLogin Successful!!\n");
    }

    else {
        printf("Incorrect Username and Password.\nTry Again.\n");
    }
}